import { jsonResponse } from "./cors.js";
import { ADVISORY_TIME_ZONE, getDayPartsForInterval, localDateTimeParts } from "./advisory-time.js";

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
  const evaluators = context?.evaluators || [evaluateLowTemperature, evaluateThunderstorm];
  const evaluations = evaluators.map((evaluator) => evaluator(context));
  const advisories = evaluations.flatMap((evaluation) => evaluation.advisories).sort((left, right) => (left.category === "attention" ? -1 : 0) - (right.category === "attention" ? -1 : 0));
  const lowTemperature = evaluations.find((evaluation) => evaluation.type === "low_temperature") || { sourceStatus: {}, status: "partial", target: { targetLocalDate: null } };
  const labels = { low_temperature: "Bajas temperaturas", thunderstorm: "Tormentas" };
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
    publicTechnicalFailures: { low_temperature: daily.state === "corrupt" || hourly.state === "corrupt", thunderstorm: stormDaily.state === "corrupt" },
    evaluators: [
      (context) => evaluateLowTemperature(context),
      (context) => evaluateThunderstorm({ daily: context.stormDaily, hourly: context.stormHourly, dailyAvailable: context.stormDailyAvailable, dailyUpdatedAt: context.stormDailyUpdatedAt, hourlyUpdatedAt: context.stormHourlyUpdatedAt, now: context.now })
    ] });
  const legacyForecast = outcome.sourceStatus.forecastDaily === "available" ? "available" : outcome.sourceStatus.forecastDaily === "unavailable" && outcome.sourceStatus.forecastHourly === "unavailable" ? "unavailable" : "insufficient";
  const response = jsonResponse(request, env, { ok: true, updatedAt: iso(now), sourceStatus: { ...outcome.sourceStatus, forecast: legacyForecast }, evaluation: outcome.evaluation, families: outcome.families, advisories: outcome.advisories });
  const headers = new Headers(response.headers); headers.set("Cache-Control", "public, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}
