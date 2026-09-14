import { jsonResponse } from "./cors.js";

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const HOUR_MS = 60 * 60 * 1000;
const FORECAST_MINIMUM_HOURS = 18;
const OBSERVATION_MAX_AGE_MS = 20 * 60 * 1000;
const OBSERVATION_MAX_GAP_MS = 15 * 60 * 1000;
const DISCLAIMER = "Aviso automático no oficial.";

function localParts(value) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
function localDate(value) { const parts = localParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function finite(value) { return Number.isFinite(value) ? value : null; }
function timestamp(value) { const parsed = typeof value === "number" ? value : Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : null; }
function iso(value) { return new Date(value).toISOString(); }
function minimum(hours, field) { const values = hours.map((hour) => finite(hour[field])).filter((value) => value !== null); return values.length ? Math.min(...values) : null; }

function forecastDays(hourly, now) {
  const grouped = new Map();
  for (const item of hourly?.hours || []) {
    const end = timestamp(item?.end);
    if (end === null || end < now) continue;
    const temperature = finite(item.temperature);
    if (temperature === null) continue;
    const date = localDate(new Date(end));
    const hour = Number(localParts(new Date(end)).hour);
    const key = `${date}:${hour}`;
    if (!grouped.has(date)) grouped.set(date, new Map());
    if (!grouped.get(date).has(key)) grouped.get(date).set(key, { end, temperature, feelsLike: finite(item.temperature_feels_like) });
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, entries]) => ({ date, hours: [...entries.values()].sort((left, right) => left.end - right.end) }));
}

function firstEligibleDay(hourly, now) { return forecastDays(hourly, now).find((day) => day.hours.length >= FORECAST_MINIMUM_HOURS) || null; }
function consecutiveFeelsLike(hours) {
  let run = []; let best = [];
  for (const hour of hours) {
    const applies = hour.feelsLike !== null && hour.feelsLike <= 0 && hour.temperature <= 10;
    if (!applies) { run = []; continue; }
    if (run.length && hour.end - run.at(-1).end !== HOUR_MS) run = [];
    run.push(hour);
    if (run.length > best.length) best = [...run];
  }
  return best.length >= 2 ? best : null;
}
function period(hours) {
  const startsAt = Math.min(...hours.map((hour) => hour.end));
  const endsAt = Math.max(...hours.map((hour) => hour.end)) + HOUR_MS;
  return { startsAt: iso(startsAt), endsAt: iso(endsAt) };
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

export function evaluateLowTemperatureAdvisories({ hourly, forecastUpdatedAt = null, observationRows = [], ema = null, now = Date.now() } = {}) {
  const day = firstEligibleDay(hourly, now);
  const sourceStatus = { forecast: day ? "available" : "insufficient", observation: "unavailable" };
  if (!day) return { sourceStatus, advisories: [] };
  const forecastMinimumC = minimum(day.hours, "temperature");
  const forecastMinimumFeelsLikeC = minimum(day.hours.map((hour) => ({ temperature_feels_like: hour.feelsLike })), "temperature_feels_like");
  const coldMinimumHours = day.hours.filter((hour) => hour.temperature <= 4);
  const veryColdHours = day.hours.filter((hour) => hour.temperature <= 2);
  const feelsLikeRun = consecutiveFeelsLike(day.hours);
  const attention = veryColdHours.length || feelsLikeRun;
  const triggeringHours = attention ? [...veryColdHours, ...(feelsLikeRun || [])] : coldMinimumHours;
  const uniqueHours = [...new Map(triggeringHours.map((hour) => [hour.end, hour])).values()];
  const observation = observationContext(observationRows, ema, now);
  sourceStatus.observation = observation.status;
  if (!attention && !coldMinimumHours.length) return { sourceStatus, advisories: [] };
  const category = attention ? "attention" : "information";
  const basis = [attention ? veryColdHours.length ? "forecast_temperature" : "forecast_feels_like" : "forecast_temperature", ...observation.basis];
  const timing = period(uniqueHours);
  return {
    sourceStatus,
    advisories: [{
      id: advisoryId(category, day.date), type: "low_temperature", category,
      title: attention ? "Temperaturas muy bajas previstas" : "Bajas temperaturas previstas",
      summary: attention ? "Se prevén temperaturas muy bajas durante el período indicado." : "Se prevén bajas temperaturas durante la próxima madrugada.",
      ...timing, basis,
      values: { forecastMinimumC, forecastMinimumFeelsLikeC, forecastUpdatedAt },
      disclaimer: DISCLAIMER
    }]
  };
}

export async function advisoriesResponse(request, env, now = Date.now()) {
  const forecast = await env.HISTORY_DB.prepare("SELECT payload_json, updated_at, expires_at FROM social_forecast_cache WHERE source_type = 'hourly' LIMIT 1").first();
  let evaluation;
  if (!forecast || !Number.isFinite(forecast.expires_at) || forecast.expires_at <= now) {
    evaluation = { sourceStatus: { forecast: "unavailable", observation: "unavailable" }, advisories: [] };
  } else {
    let hourly = null;
    try { hourly = JSON.parse(forecast.payload_json); } catch { hourly = null; }
    const [ema, observations] = await Promise.all([
      env.HISTORY_DB.prepare("SELECT data_freshness, capture_health, latest_observed_at FROM ema_health_state WHERE id = 1").first(),
      env.HISTORY_DB.prepare("SELECT observed_at, temperature, feels_like FROM weather_observations ORDER BY observed_at DESC LIMIT 2").all()
    ]);
    evaluation = evaluateLowTemperatureAdvisories({ hourly, forecastUpdatedAt: forecast.updated_at || null, observationRows: observations.results || [], ema, now });
  }
  const response = jsonResponse(request, env, { ok: true, updatedAt: iso(now), sourceStatus: evaluation.sourceStatus, advisories: evaluation.advisories });
  const headers = new Headers(response.headers); headers.set("Cache-Control", "public, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}
