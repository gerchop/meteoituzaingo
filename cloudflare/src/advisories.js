import { jsonResponse } from "./cors.js";

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const HOUR_MS = 60 * 60 * 1000;
const OBSERVATION_MAX_AGE_MS = 20 * 60 * 1000;
const OBSERVATION_MAX_GAP_MS = 15 * 60 * 1000;
const DISCLAIMER = "Aviso automático no oficial.";
const TARGET_HOUR = 12;
const TARGET_DAWN_HOURS = [0, 1, 2, 3, 4, 5];

function localParts(value) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
function localDate(value) { const parts = localParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function finite(value) { return Number.isFinite(value) ? value : null; }
function timestamp(value) { const parsed = typeof value === "number" ? value : Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : null; }
function iso(value) { return new Date(value).toISOString(); }
function dateAfter(date, days) { const [year, month, day] = date.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10); }
function localMidnight(date) { return Date.parse(`${date}T00:00:00-03:00`); }

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
  const timing = hourlyAttention && !dailyAttention && !dailyInformation ? periodForHours(hourlyResult.feelsLikeRun, target) : { startsAt: target.startsAt, endsAt: target.endsAt };
  const basis = [dailyAttention || dailyInformation ? "forecast_daily_temperature" : "forecast_hourly_feels_like", ...observation.basis];
  const advisory = {
    id: advisoryId(category, target.targetLocalDate), type: "low_temperature", category,
    title: category === "attention" ? "Temperaturas muy bajas previstas" : "Bajas temperaturas previstas",
    summary: dailyAttention || dailyInformation ? "Se prevén temperaturas bajas durante la jornada indicada." : "Se prevé una sensación térmica muy baja durante el período indicado.",
    ...timing, basis,
    values: { forecastMinimumC: dailyResult.minimum, forecastMinimumFeelsLikeC: hourlyResult.hours.length ? Math.min(...hourlyResult.hours.map((hour) => hour.feelsLike)) : null, forecastUpdatedAt },
    disclaimer: DISCLAIMER
  };
  return { type: "low_temperature", status, target, sourceStatus, advisories: [advisory] };
}

/** Extensible aggregation point: future families register independent evaluators here. */
export function evaluateAdvisories(context) {
  const evaluators = context?.evaluators || [evaluateLowTemperature];
  const evaluations = evaluators.map((evaluator) => evaluator(context));
  const advisories = evaluations.flatMap((evaluation) => evaluation.advisories).sort((left, right) => (left.category === "attention" ? -1 : 0) - (right.category === "attention" ? -1 : 0));
  const lowTemperature = evaluations.find((evaluation) => evaluation.type === "low_temperature") || { sourceStatus: {}, status: "partial", target: { targetLocalDate: null } };
  return { evaluations, advisories, sourceStatus: lowTemperature.sourceStatus, evaluation: { status: lowTemperature.status, targetLocalDate: lowTemperature.target.targetLocalDate } };
}

function usableCache(row, now) {
  if (!row || !Number.isFinite(row.expires_at) || row.expires_at <= now) return { available: false, data: null, updatedAt: null };
  try { return { available: true, data: JSON.parse(row.payload_json), updatedAt: row.updated_at || null }; } catch { return { available: false, data: null, updatedAt: null }; }
}

export async function advisoriesResponse(request, env, now = Date.now()) {
  const [dailyRow, hourlyRow] = await Promise.all([
    env.HISTORY_DB.prepare("SELECT payload_json, updated_at, expires_at FROM social_forecast_cache WHERE source_type = 'daily' LIMIT 1").first(),
    env.HISTORY_DB.prepare("SELECT payload_json, updated_at, expires_at FROM social_forecast_cache WHERE source_type = 'hourly' LIMIT 1").first()
  ]);
  const daily = usableCache(dailyRow, now); const hourly = usableCache(hourlyRow, now);
  const [ema, observations] = await Promise.all([
    env.HISTORY_DB.prepare("SELECT data_freshness, capture_health, latest_observed_at FROM ema_health_state WHERE id = 1").first(),
    env.HISTORY_DB.prepare("SELECT observed_at, temperature, feels_like FROM weather_observations ORDER BY observed_at DESC LIMIT 2").all()
  ]);
  const outcome = evaluateAdvisories({ daily: daily.data, hourly: hourly.data, dailyAvailable: daily.available, hourlyAvailable: hourly.available, forecastUpdatedAt: daily.updatedAt || hourly.updatedAt, observationRows: observations.results || [], ema, now });
  const legacyForecast = outcome.sourceStatus.forecastDaily === "available" ? "available" : outcome.sourceStatus.forecastDaily === "unavailable" && outcome.sourceStatus.forecastHourly === "unavailable" ? "unavailable" : "insufficient";
  const response = jsonResponse(request, env, { ok: true, updatedAt: iso(now), sourceStatus: { ...outcome.sourceStatus, forecast: legacyForecast }, evaluation: outcome.evaluation, advisories: outcome.advisories });
  const headers = new Headers(response.headers); headers.set("Cache-Control", "public, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}
