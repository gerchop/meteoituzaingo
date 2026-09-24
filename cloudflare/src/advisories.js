import { jsonResponse } from "./cors.js";
import { ADVISORY_TIME_ZONE, DAY_PARTS, getDayPartsForInterval, hourlyIntervalStart, localDateTimeParts } from "./advisory-time.js";

const TIME_ZONE = ADVISORY_TIME_ZONE;
const HOUR_MS = 60 * 60 * 1000;
const OBSERVATION_MAX_AGE_MS = 20 * 60 * 1000;
const OBSERVATION_MAX_GAP_MS = 15 * 60 * 1000;
const DISCLAIMER = "Aviso automático no oficial.";
const TARGET_HOUR = 12;
const TARGET_DAWN_HOURS = [0, 1, 2, 3, 4, 5];
export const THUNDERSTORM_SYMBOLS = [34, 35];
export const RESERVED_DRY_THUNDERSTORM_SYMBOLS = [10, 11];
export const RESERVED_THUNDERSTORM_HAIL_SYMBOLS = [38, 39];
export const THUNDERSTORM_MAX_FORECAST_AGE_MS = 8 * HOUR_MS;
export const HIGH_TEMPERATURE_INFORMATION_C = 34;
export const HIGH_TEMPERATURE_ATTENTION_C = 36;
export const WIND_INFORMATION_KMH = 30;
export const WIND_ATTENTION_KMH = 45;
export const WIND_GUST_INFORMATION_KMH = 45;
export const WIND_GUST_ATTENTION_KMH = 60;

function localParts(value) {
  return localDateTimeParts(value);
}
function localDate(value) { const parts = localParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function finite(value) { return Number.isFinite(value) ? value : null; }
function timestamp(value) { const parsed = typeof value === "number" ? value : Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : null; }
function iso(value) { return new Date(value).toISOString(); }
function dateAfter(date, days) { const [year, month, day] = date.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10); }
function localMidnight(date) { return Date.parse(`${date}T00:00:00-03:00`); }
function todayAndTomorrow(now = Date.now()) {
  const today = localDate(new Date(now));
  return [today, dateAfter(today, 1)];
}

/** A deterministic policy: after local noon, the next thermal day is relevant. */
export function selectLowTemperatureTargetPeriod(now = Date.now()) {
  const parts = localParts(new Date(now));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const targetLocalDate = Number(parts.hour) >= TARGET_HOUR ? dateAfter(today, 1) : today;
  const startsAt = localMidnight(targetLocalDate);
  return { targetLocalDate, startsAt: iso(startsAt), endsAt: iso(startsAt + 24 * HOUR_MS), dawnStartsAt: iso(startsAt), dawnEndsAt: iso(startsAt + 6 * HOUR_MS) };
}

function validDailyTarget(daily, targetLocalDate) {
  const item = (daily?.days || []).find((day) => timestamp(day?.start) !== null && localDate(new Date(timestamp(day.start))) === targetLocalDate);
  const minimum = finite(item?.temperature_min);
  return minimum === null ? { status: "insufficient", minimum: null } : { status: "available", minimum };
}

function hourlyDawnTarget(hourly, targetLocalDate) {
  if (!Array.isArray(hourly?.hours)) return { status: "unavailable", hours: [], feelsLikeRun: null };
  const candidates = new Map();
  let invalid = false;
  for (const item of hourly.hours) {
    const end = timestamp(item?.end);
    if (end === null) { invalid = true; continue; }
    if (localDate(new Date(end)) !== targetLocalDate) continue;
    const hour = Number(localParts(new Date(end)).hour);
    if (!TARGET_DAWN_HOURS.includes(hour)) continue;
    if (candidates.has(hour)) { invalid = true; continue; }
    const temperature = finite(item.temperature); const feelsLike = finite(item.temperature_feels_like);
    if (temperature === null || feelsLike === null) { invalid = true; continue; }
    candidates.set(hour, { end, temperature, feelsLike });
  }
  const hours = TARGET_DAWN_HOURS.map((hour) => candidates.get(hour)).filter(Boolean);
  const continuous = hours.length === TARGET_DAWN_HOURS.length && hours.every((hour, index) => index === 0 || hour.end - hours[index - 1].end === HOUR_MS);
  if (invalid || !continuous) return { status: "insufficient", hours, feelsLikeRun: null };
  let run = []; let best = [];
  for (const hour of hours) {
    const applies = hour.feelsLike <= 0 && hour.temperature <= 10;
    if (!applies) { run = []; continue; }
    run.push(hour);
    if (run.length > best.length) best = [...run];
  }
  return { status: "available", hours, feelsLikeRun: best.length >= 2 ? best : null };
}

function periodForHours(hours, fallback) {
  if (!hours?.length) return fallback;
  return { startsAt: iso(Math.min(...hours.map((hour) => hour.end))), endsAt: iso(Math.max(...hours.map((hour) => hour.end)) + HOUR_MS) };
}
function evidenceForHours(hours) {
  if (!hours?.length) return [];
  const timing = periodForHours(hours);
  return getDayPartsForInterval(timing.startsAt, timing.endsAt);
}
function advisoryId(category, date) { return `low-temperature:${category}:${date}`; }

export function observationContext(rows, ema, now = Date.now()) {
  if (ema?.data_freshness !== "FRESH" || ema?.capture_health !== "OK") return { status: "unavailable", confirmed: false, basis: [] };
  const latest = rows?.[0]; const previous = rows?.[1];
  const latestAt = timestamp(latest?.observed_at); const previousAt = timestamp(previous?.observed_at);
  const valid = [latest, previous].every((row) => finite(row?.temperature) !== null || finite(row?.feels_like) !== null);
  if (!valid || latestAt === null || previousAt === null || now - latestAt > OBSERVATION_MAX_AGE_MS || latestAt - previousAt > OBSERVATION_MAX_GAP_MS || latestAt < previousAt) return { status: "unavailable", confirmed: false, basis: [] };
  const relevant = [latest, previous].every((row) => finite(row.temperature) !== null && finite(row.temperature) <= 2 || finite(row.feels_like) !== null && finite(row.feels_like) <= 0);
  if (!relevant) return { status: "fresh", confirmed: false, basis: [] };
  const temperatures = [latest, previous].map((row) => finite(row.temperature));
  return { status: "fresh", confirmed: true, basis: [temperatures.every((value) => value !== null && value <= 2) ? "observation_temperature" : "observation_feels_like"] };
}

/** Internal evaluator contract: source availability and meteorological result remain independent. */
export function evaluateLowTemperature({ daily, hourly, dailyAvailable = true, hourlyAvailable = true, forecastUpdatedAt = null, observationRows = [], ema = null, now = Date.now() } = {}) {
  const target = selectLowTemperatureTargetPeriod(now);
  const dailyResult = dailyAvailable ? validDailyTarget(daily, target.targetLocalDate) : { status: "unavailable", minimum: null };
  const hourlyResult = hourlyAvailable ? hourlyDawnTarget(hourly, target.targetLocalDate) : { status: "unavailable", hours: [], feelsLikeRun: null };
  const observation = observationContext(observationRows, ema, now);
  const dailyAttention = dailyResult.status === "available" && dailyResult.minimum <= 2;
  const dailyInformation = dailyResult.status === "available" && dailyResult.minimum <= 4;
  const hourlyAttention = hourlyResult.status === "available" && hourlyResult.feelsLikeRun;
  const category = dailyAttention || hourlyAttention ? "attention" : dailyInformation ? "information" : null;
  const status = category ? "advisory" : dailyResult.status === "available" && hourlyResult.status === "available" ? "no_advisory" : "partial";
  const sourceStatus = { forecastDaily: dailyResult.status, forecastHourly: hourlyResult.status, observation: observation.status };
  if (!category) return { type: "low_temperature", status, target, sourceStatus, advisories: [] };
  const dailyTrigger = dailyAttention || dailyInformation;
  const hourlyEvidencePeriods = evidenceForHours(hourlyResult.feelsLikeRun);
  const timing = hourlyAttention && !dailyTrigger ? periodForHours(hourlyResult.feelsLikeRun, target) : { startsAt: target.startsAt, endsAt: target.endsAt };
  const basis = [dailyAttention || dailyInformation ? "forecast_daily_temperature" : "forecast_hourly_feels_like", ...observation.basis];
  const advisory = {
    id: advisoryId(category, target.targetLocalDate), type: "low_temperature", category,
    title: category === "attention" ? "Temperaturas muy bajas previstas" : "Bajas temperaturas previstas",
    summary: dailyAttention || dailyInformation ? "Se prevén temperaturas bajas durante la jornada indicada." : "Se prevé una sensación térmica muy baja durante el período indicado.",
    // Legacy bounds remain for existing consumers. New clients must use the
    // explicit temporal model below rather than treating a daily boundary as
    // the duration of a weather event.
    ...timing, basis,
    targetLocalDate: target.targetLocalDate,
    evaluationPeriod: { startsAt: target.startsAt, endsAt: target.endsAt },
    evidencePeriods: dailyTrigger ? [] : hourlyEvidencePeriods,
    supportingEvidencePeriods: dailyTrigger && hourlyAttention ? hourlyEvidencePeriods : [],
    displayValidity: "dynamic",
    temporalPrecision: dailyTrigger ? "daily" : "hourly",
    values: {
      forecastMinimumC: dailyResult.minimum,
      forecastMinimumFeelsLikeC: hourlyResult.status === "available" ? Math.min(...hourlyResult.hours.map((hour) => hour.feelsLike)) : null,
      // This is explanatory evidence only.  LOW_TEMP thresholds, target-date
      // policy and category selection above deliberately remain unchanged.
      triggerRun: hourlyAttention ? (() => {
        const minimum = hourlyResult.feelsLikeRun.reduce((best, hour) => hour.feelsLike < best.feelsLike ? hour : best, hourlyResult.feelsLikeRun[0]);
        const period = periodForHours(hourlyResult.feelsLikeRun, target);
        return {
          minFeelsLike: minimum.feelsLike,
          temperatureAtMinFeelsLike: minimum.temperature,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          slotCount: hourlyResult.feelsLikeRun.length,
          dayParts: evidenceForHours(hourlyResult.feelsLikeRun).flatMap((item) => item.dayParts)
        };
      })() : null,
      forecastUpdatedAt
    },
    disclaimer: DISCLAIMER
  };
  return { type: "low_temperature", status, target, sourceStatus, advisories: [advisory] };
}

function forecastFreshness(updatedAt, now) {
  const updated = timestamp(updatedAt);
  if (updated === null || updated > now || now - updated > THUNDERSTORM_MAX_FORECAST_AGE_MS) return false;
  return true;
}

function stormDailyTargets(daily, targetDates) {
  if (!Array.isArray(daily?.days)) return { status: "insufficient", days: [] };
  const byDate = new Map();
  for (const item of daily.days) {
    const start = timestamp(item?.start);
    if (start === null) continue;
    const date = localDate(new Date(start));
    if (targetDates.includes(date) && !byDate.has(date)) byDate.set(date, item);
  }
  if (targetDates.some((date) => !byDate.has(date))) return { status: "insufficient", days: [] };
  const days = targetDates.map((date) => ({ date, item: byDate.get(date), symbol: finite(byDate.get(date)?.symbol) }));
  if (days.some((day) => day.symbol === null)) return { status: "insufficient", days: [] };
  return { status: "available", days };
}

function stormHourlyEvidence(hourly, updatedAt, targetDates, now) {
  if (!forecastFreshness(updatedAt, now) || !Array.isArray(hourly?.hours)) return [];
  const evidence = new Map();
  for (const hour of hourly.hours) {
    const end = timestamp(hour?.end); const symbol = finite(hour?.symbol);
    if (end === null || symbol === null || !THUNDERSTORM_SYMBOLS.includes(symbol)) continue;
    const date = localDate(new Date(end));
    if (!targetDates.includes(date)) continue;
    const dayPart = getDayPartsForInterval(iso(end), iso(end + HOUR_MS))[0]?.dayParts?.[0];
    if (!dayPart) continue;
    if (!evidence.has(date)) evidence.set(date, []);
    const items = evidence.get(date);
    if (!items.includes(dayPart)) items.push(dayPart);
  }
  return targetDates.filter((date) => evidence.has(date)).map((date) => ({ date, dayParts: evidence.get(date) }));
}

/**
 * Conservative local thunderstorm evaluator. It reads only supplied cached
 * forecast data: daily symbols activate it, hourly symbols merely refine time.
 */
export function evaluateThunderstorm({ daily, hourly, dailyAvailable = true, dailyUpdatedAt = null, hourlyUpdatedAt = null, now = Date.now() } = {}) {
  const targetLocalDates = todayAndTomorrow(now);
  const target = { targetLocalDates, startsAt: iso(localMidnight(targetLocalDates[0])), endsAt: iso(localMidnight(dateAfter(targetLocalDates[1], 1)) ) };
  if (!dailyAvailable || !forecastFreshness(dailyUpdatedAt, now)) return { type: "thunderstorm", status: "insufficient_data", target, sourceStatus: { forecastDaily: "insufficient", forecastHourly: "unavailable" }, advisories: [] };
  const dailyResult = stormDailyTargets(daily, targetLocalDates);
  if (dailyResult.status !== "available") return { type: "thunderstorm", status: "insufficient_data", target, sourceStatus: { forecastDaily: "insufficient", forecastHourly: Array.isArray(hourly?.hours) ? "available" : "unavailable" }, advisories: [] };
  const positive = dailyResult.days.filter((day) => THUNDERSTORM_SYMBOLS.includes(day.symbol));
  const sourceStatus = { forecastDaily: "available", forecastHourly: forecastFreshness(hourlyUpdatedAt, now) && Array.isArray(hourly?.hours) ? "available" : "unavailable" };
  if (!positive.length) return { type: "thunderstorm", status: "no_advisory", target, sourceStatus, advisories: [] };
  const hourlyEvidence = stormHourlyEvidence(hourly, hourlyUpdatedAt, positive.map((day) => day.date), now);
  const dayPartsByDate = new Map(hourlyEvidence.map((period) => [period.date, period.dayParts]));
  const evidencePeriods = positive.map((day) => ({ date: day.date, dayParts: dayPartsByDate.get(day.date) || [] }));
  const forecastDays = positive.map((day) => ({
    date: day.date,
    precipitationProbability: finite(day.item?.rain_probability),
    rainMm: finite(day.item?.rain),
    dayParts: dayPartsByDate.get(day.date) || []
  }));
  const advisory = {
    id: "thunderstorm:local", type: "thunderstorm", category: "information",
    title: "Tormentas previstas", summary: "El pronóstico disponible indica tormentas para la jornada señalada.",
    startsAt: target.startsAt, endsAt: target.endsAt, targetLocalDate: positive[0].date,
    targetLocalDates: positive.map((day) => day.date), temporalPrecision: "daily",
    evaluationPeriod: target, evidencePeriods, supportingEvidencePeriods: hourlyEvidence,
    displayValidity: "dynamic", basis: ["forecast_daily_symbol"],
    values: { forecastDays, forecastUpdatedAt: dailyUpdatedAt }, disclaimer: DISCLAIMER
  };
  return { type: "thunderstorm", status: "advisory", target, sourceStatus, advisories: [advisory] };
}

function dailyMaximumTargets(daily, targetDates) {
  if (!Array.isArray(daily?.days)) return { status: "insufficient", days: [] };
  const byDate = new Map(); const duplicates = new Set();
  for (const item of daily.days) {
    const start = timestamp(item?.start); if (start === null) continue;
    const date = localDate(new Date(start)); if (!targetDates.includes(date)) continue;
    if (byDate.has(date)) { duplicates.add(date); continue; }
    byDate.set(date, { item, maximum: finite(item.temperature_max) });
  }
  const days = targetDates.filter((date) => byDate.has(date) && !duplicates.has(date) && byDate.get(date).maximum !== null).map((date) => ({ date, ...byDate.get(date) }));
  return { status: days.length === targetDates.length ? "available" : "insufficient", days };
}

function hourlySlotsForDates(hourly, updatedAt, targetDates, now) {
  if (!forecastFreshness(updatedAt, now) || !Array.isArray(hourly?.hours)) return { status: "unavailable", slots: [] };
  const slots = new Map(); const duplicates = new Set();
  for (const item of hourly.hours) {
    const start = hourlyIntervalStart(item); const end = timestamp(item?.end);
    if (start === null || end === null || end <= now) continue;
    const date = localDate(new Date(start)); if (!targetDates.includes(date)) continue;
    if (slots.has(start)) { duplicates.add(start); continue; }
    slots.set(start, { item, start, end, date, local: localParts(new Date(start)) });
  }
  duplicates.forEach((start) => slots.delete(start));
  return { status: slots.size ? "available" : "insufficient", slots: [...slots.values()].sort((left, right) => left.start - right.start) };
}

function completeDayPartSlots(slots, date, part) {
  const matching = slots.filter((slot) => slot.date === date && slot.local.hour >= part.startHour && slot.local.hour <= part.endHour);
  if (matching.length !== part.endHour - part.startHour + 1) return [];
  if (!matching.every((slot, index) => slot.local.hour === part.startHour + index && (index === 0 || slot.start - matching[index - 1].start === HOUR_MS))) return [];
  return matching;
}

function highTemperatureFeelsLikeEvidence(hourly, hourlyUpdatedAt, positiveDays, now) {
  const targets = positiveDays.map((day) => day.date);
  const source = hourlySlotsForDates(hourly, hourlyUpdatedAt, targets, now);
  if (source.status !== "available") return { sourceStatus: source.status, byDate: new Map() };
  const byDate = new Map();
  for (const day of positiveDays) {
    const evidence = [];
    for (const part of DAY_PARTS) {
      const slots = completeDayPartSlots(source.slots, day.date, part);
      if (!slots.length || !slots.every((slot) => finite(slot.item.temperature) !== null && finite(slot.item.temperature_feels_like) !== null && finite(slot.item.humidity) !== null)) continue;
      const qualifying = slots.filter((slot) => {
        const temperature = finite(slot.item.temperature); const feelsLike = finite(slot.item.temperature_feels_like); const humidity = finite(slot.item.humidity);
        return temperature > 26 && humidity > 40 && feelsLike > temperature && feelsLike - temperature >= 3;
      });
      if (!qualifying.length) continue;
      const maximum = qualifying.reduce((best, slot) => finite(slot.item.temperature_feels_like) > finite(best.item.temperature_feels_like) ? slot : best, qualifying[0]);
      evidence.push({ dayPart: part.id, feelsLikeC: finite(maximum.item.temperature_feels_like), temperatureC: finite(maximum.item.temperature), humidity: finite(maximum.item.humidity), startsAt: iso(maximum.start), endsAt: iso(maximum.end) });
    }
    if (evidence.length) byDate.set(day.date, evidence.sort((left, right) => right.feelsLikeC - left.feelsLikeC || left.startsAt.localeCompare(right.startsAt))[0]);
  }
  return { sourceStatus: "available", byDate };
}

/** Daily maxima are the only HIGH_TEMP trigger; hourly feels-like is descriptive. */
export function evaluateHighTemperature({ daily, hourly, dailyAvailable = true, dailyUpdatedAt = null, hourlyUpdatedAt = null, now = Date.now() } = {}) {
  const targetLocalDates = todayAndTomorrow(now);
  const target = { targetLocalDates, startsAt: iso(localMidnight(targetLocalDates[0])), endsAt: iso(localMidnight(dateAfter(targetLocalDates[1], 1))) };
  if (!dailyAvailable || !forecastFreshness(dailyUpdatedAt, now)) return { type: "high_temperature", status: "insufficient_data", target, sourceStatus: { forecastDaily: "insufficient", forecastHourly: "unavailable" }, advisories: [] };
  const dailyResult = dailyMaximumTargets(daily, targetLocalDates);
  const positive = dailyResult.days.filter((day) => day.maximum >= HIGH_TEMPERATURE_INFORMATION_C);
  const hourlyEvidence = highTemperatureFeelsLikeEvidence(hourly, hourlyUpdatedAt, positive, now);
  const sourceStatus = { forecastDaily: dailyResult.status === "available" ? "available" : "insufficient", forecastHourly: hourlyEvidence.sourceStatus };
  if (!positive.length) return { type: "high_temperature", status: dailyResult.status === "available" ? "no_advisory" : "insufficient_data", target, sourceStatus, advisories: [] };
  const category = positive.some((day) => day.maximum >= HIGH_TEMPERATURE_ATTENTION_C) ? "attention" : "information";
  const forecastDays = positive.map((day) => ({ date: day.date, maximumC: day.maximum, feelsLike: hourlyEvidence.byDate.get(day.date) || null }));
  const evidencePeriods = forecastDays.map((day) => ({ date: day.date, dayParts: day.feelsLike ? [day.feelsLike.dayPart] : [] }));
  const advisory = {
    id: "high-temperature:local", type: "high_temperature", category,
    title: "Altas temperaturas previstas", summary: "Se prevén temperaturas elevadas durante la jornada indicada.",
    startsAt: target.startsAt, endsAt: target.endsAt, targetLocalDate: positive[0].date, targetLocalDates: positive.map((day) => day.date),
    evaluationPeriod: target, evidencePeriods, supportingEvidencePeriods: evidencePeriods.filter((period) => period.dayParts.length), displayValidity: "dynamic", temporalPrecision: "daily",
    basis: ["forecast_daily_temperature", ...(hourlyEvidence.byDate.size ? ["forecast_hourly_feels_like"] : [])],
    values: { forecastDays, forecastUpdatedAt: dailyUpdatedAt }, disclaimer: DISCLAIMER
  };
  return { type: "high_temperature", status: "advisory", target, sourceStatus, advisories: [advisory] };
}

const WIND_DIRECTIONS = { N: "norte", NNE: "norte", NE: "noreste", ENE: "noreste", E: "este", ESE: "este", SE: "sudeste", SSE: "sudeste", S: "sur", SSO: "sudoeste", SO: "sudoeste", OSO: "oeste", O: "oeste", ONO: "noroeste", NO: "noroeste", NNO: "noroeste" };
function windDirection(value) {
  if (Number.isFinite(value)) return WIND_DIRECTIONS[["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"][Math.round(value / 22.5) % 16]] || null;
  return WIND_DIRECTIONS[String(value || "").toUpperCase()] || null;
}
function sustainedWindRuns(slots, threshold) {
  let run = []; const runs = [];
  for (const slot of slots) {
    const speed = finite(slot.item.wind_speed);
    if (speed === null || speed < threshold || (run.length && slot.start - run.at(-1).start !== HOUR_MS)) { if (run.length >= 2) runs.push(run); run = []; }
    if (speed !== null && speed >= threshold) run.push(slot);
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}
function strongestRun(runs) { return runs.reduce((best, run) => !best || Math.max(...run.map((slot) => finite(slot.item.wind_speed))) > Math.max(...best.map((slot) => finite(slot.item.wind_speed))) ? run : best, null); }
function strongestGust(slots, threshold) { return slots.filter((slot) => finite(slot.item.wind_gust) !== null && finite(slot.item.wind_gust) >= threshold).reduce((best, slot) => !best || finite(slot.item.wind_gust) > finite(best.item.wind_gust) ? slot : best, null); }

/** WIND uses only fresh, future, unique hourly slots; daily and PWS never trigger it. */
export function evaluateWind({ hourly, hourlyUpdatedAt = null, now = Date.now() } = {}) {
  const targetLocalDates = todayAndTomorrow(now);
  const target = { targetLocalDates, startsAt: iso(localMidnight(targetLocalDates[0])), endsAt: iso(localMidnight(dateAfter(targetLocalDates[1], 1))) };
  const source = hourlySlotsForDates(hourly, hourlyUpdatedAt, targetLocalDates, now);
  if (source.status !== "available") return { type: "wind", status: "insufficient_data", target, sourceStatus: { forecastHourly: "insufficient", forecastDaily: "unavailable" }, advisories: [] };
  const attentionRun = strongestRun(sustainedWindRuns(source.slots, WIND_ATTENTION_KMH));
  const informationRun = strongestRun(sustainedWindRuns(source.slots, WIND_INFORMATION_KMH));
  const attentionGust = strongestGust(source.slots, WIND_GUST_ATTENTION_KMH);
  const informationGust = strongestGust(source.slots, WIND_GUST_INFORMATION_KMH);
  const category = attentionRun || attentionGust ? "attention" : informationRun || informationGust ? "information" : null;
  const sourceStatus = { forecastHourly: "available", forecastDaily: "unavailable" };
  if (!category) return { type: "wind", status: "no_advisory", target, sourceStatus, advisories: [] };
  const run = category === "attention" ? attentionRun || informationRun : informationRun;
  const gust = category === "attention" ? attentionGust || informationGust : informationGust;
  const runMaximum = run ? Math.max(...run.map((slot) => finite(slot.item.wind_speed))) : null;
  const directionSlot = run?.reduce((best, slot) => finite(slot.item.wind_speed) > finite(best.item.wind_speed) ? slot : best, run[0]) || gust;
  const direction = windDirection(directionSlot?.item.wind_direction);
  const eventSlots = [...(run || []), ...(gust ? [gust] : [])];
  const evidencePeriods = evidenceForHours(eventSlots.map((slot) => ({ end: slot.start })));
  const dayPart = evidencePeriods[0]?.dayParts?.[0] || null;
  const advisory = {
    id: "wind:local", type: "wind", category, title: "Viento previsto", summary: "El pronóstico disponible indica viento destacado para el período señalado.",
    startsAt: target.startsAt, endsAt: target.endsAt, targetLocalDate: eventSlots[0]?.date || targetLocalDates[0], targetLocalDates: [...new Set(eventSlots.map((slot) => slot.date))],
    evaluationPeriod: target, evidencePeriods, supportingEvidencePeriods: [], displayValidity: "dynamic", temporalPrecision: "hourly", basis: ["forecast_hourly_wind"],
    values: { sustainedWindKmh: runMaximum, gustKmh: gust ? finite(gust.item.wind_gust) : null, windDirection: direction, dayPart, forecastUpdatedAt: hourlyUpdatedAt }, disclaimer: DISCLAIMER
  };
  return { type: "wind", status: "advisory", target, sourceStatus, advisories: [advisory] };
}

/**
 * Public presentation deliberately has a smaller vocabulary than the engine.
 * A partial evaluation remains partial internally, but it is not an active
 * local advisory.  Real processing failures remain unavailable.
 */
export function publicAdvisoryStatus(status, technicalFailure = false) {
  if (status === "advisory" || status === "active") return "active";
  if (technicalFailure || status === "unavailable" || status === "error") return "unavailable";
  return "no_advisory";
}

/** Extensible aggregation point: future families register independent evaluators here. */
export function evaluateAdvisories(context) {
  const evaluators = context?.evaluators || [evaluateLowTemperature, evaluateHighTemperature, evaluateThunderstorm, evaluateWind];
  const evaluations = evaluators.map((evaluator) => evaluator(context));
  const advisories = evaluations.flatMap((evaluation) => evaluation.advisories).sort((left, right) => (left.category === "attention" ? -1 : 0) - (right.category === "attention" ? -1 : 0));
  const lowTemperature = evaluations.find((evaluation) => evaluation.type === "low_temperature") || { sourceStatus: {}, status: "partial", target: { targetLocalDate: null } };
  const labels = { low_temperature: "Bajas temperaturas", high_temperature: "Altas temperaturas", thunderstorm: "Tormentas", wind: "Viento" };
  const failures = context?.publicTechnicalFailures || {};
  const families = evaluations.filter((evaluation) => labels[evaluation.type]).map((evaluation) => ({ id: evaluation.type, label: labels[evaluation.type], evaluationStatus: evaluation.status, publicStatus: publicAdvisoryStatus(evaluation.status, Boolean(failures[evaluation.type])), advisories: evaluation.advisories }));
  return { evaluations, families, advisories, sourceStatus: lowTemperature.sourceStatus, evaluation: { status: lowTemperature.status, targetLocalDate: lowTemperature.target.targetLocalDate } };
}

function usableCache(row, now) {
  if (!row) return { available: false, data: null, updatedAt: null, state: "missing" };
  if (!Number.isFinite(row.expires_at) || row.expires_at <= now) return { available: false, data: null, updatedAt: row.updated_at || null, state: "expired" };
  try { return { available: true, data: JSON.parse(row.payload_json), updatedAt: row.updated_at || null, state: "available" }; } catch { return { available: false, data: null, updatedAt: row.updated_at || null, state: "corrupt" }; }
}

/** Parses D1 cache without treating the upstream TTL as meteorological validity. */
function storedCache(row) {
  if (!row) return { available: false, data: null, updatedAt: null, state: "missing" };
  try { return { available: true, data: JSON.parse(row.payload_json), updatedAt: row.updated_at || null, state: "available" }; } catch { return { available: false, data: null, updatedAt: row.updated_at || null, state: "corrupt" }; }
}

export async function advisoriesResponse(request, env, now = Date.now()) {
  const [dailyRow, hourlyRow] = await Promise.all([
    env.HISTORY_DB.prepare("SELECT payload_json, updated_at, expires_at FROM social_forecast_cache WHERE source_type = 'daily' LIMIT 1").first(),
    env.HISTORY_DB.prepare("SELECT payload_json, updated_at, expires_at FROM social_forecast_cache WHERE source_type = 'hourly' LIMIT 1").first()
  ]);
  const daily = usableCache(dailyRow, now); const hourly = usableCache(hourlyRow, now);
  const stormDaily = storedCache(dailyRow); const stormHourly = storedCache(hourlyRow);
  const [ema, observations] = await Promise.all([
    env.HISTORY_DB.prepare("SELECT data_freshness, capture_health, latest_observed_at FROM ema_health_state WHERE id = 1").first(),
    env.HISTORY_DB.prepare("SELECT observed_at, temperature, feels_like FROM weather_observations ORDER BY observed_at DESC LIMIT 2").all()
  ]);
  const outcome = evaluateAdvisories({ daily: daily.data, hourly: hourly.data, dailyAvailable: daily.available, hourlyAvailable: hourly.available, forecastUpdatedAt: daily.updatedAt || hourly.updatedAt, stormDaily: stormDaily.data, stormHourly: stormHourly.data, stormDailyAvailable: stormDaily.available, stormDailyUpdatedAt: stormDaily.updatedAt, stormHourlyUpdatedAt: stormHourly.updatedAt, observationRows: observations.results || [], ema, now,
    publicTechnicalFailures: { low_temperature: daily.state === "corrupt" || hourly.state === "corrupt", high_temperature: stormDaily.state === "corrupt", thunderstorm: stormDaily.state === "corrupt", wind: stormHourly.state === "corrupt" },
    evaluators: [
      (context) => evaluateLowTemperature(context),
      (context) => evaluateHighTemperature({ daily: context.stormDaily, hourly: context.stormHourly, dailyAvailable: context.stormDailyAvailable, dailyUpdatedAt: context.stormDailyUpdatedAt, hourlyUpdatedAt: context.stormHourlyUpdatedAt, now: context.now }),
      (context) => evaluateThunderstorm({ daily: context.stormDaily, hourly: context.stormHourly, dailyAvailable: context.stormDailyAvailable, dailyUpdatedAt: context.stormDailyUpdatedAt, hourlyUpdatedAt: context.stormHourlyUpdatedAt, now: context.now }),
      (context) => evaluateWind({ hourly: context.stormHourly, hourlyUpdatedAt: context.stormHourlyUpdatedAt, now: context.now })
    ] });
  const legacyForecast = outcome.sourceStatus.forecastDaily === "available" ? "available" : outcome.sourceStatus.forecastDaily === "unavailable" && outcome.sourceStatus.forecastHourly === "unavailable" ? "unavailable" : "insufficient";
  const response = jsonResponse(request, env, { ok: true, updatedAt: iso(now), sourceStatus: { ...outcome.sourceStatus, forecast: legacyForecast }, evaluation: outcome.evaluation, families: outcome.families, advisories: outcome.advisories });
  const headers = new Headers(response.headers); headers.set("Cache-Control", "public, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}
