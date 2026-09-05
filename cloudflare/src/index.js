import { corsHeaders, jsonResponse } from "./cors.js";
import { insertObservation, serializeObservation } from "./database.js";
import { fetchWeatherObservation } from "./weather.js";
import { argentinaDate as socialDate, buildSocialForecast, publicForecast, saveSocialForecast, serializeSocialForecast } from "./social-forecast.js";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const HISTORY_LIMITS = { hours: [24], days: [7, 30] };
const COMPARE_PERIODS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
const CSV_HEADER = ["fecha_hora", "temperatura_c", "sensacion_c", "humedad_pct", "presion_hpa", "viento_kmh", "rafaga_kmh", "direccion", "direccion_grados", "precipitacion_mm_h", "precipitacion_total_mm", "punto_rocio_c"];
const DAILY_INTERVAL_MS = 600000;
const DAILY_VALID_LIMITS = { temperature: [-90, 70], humidity: [0, 100], pressure: [800, 1100], windSpeed: [0, 300], windGust: [0, 400], precipTotal: [0, 2000] };
const STATISTICS_COVERAGE_GOOD = 90;
const STATISTICS_COVERAGE_PARTIAL = 50;
const SOCIAL_CRON = "1 3 * * *";
const SOCIAL_COOKIE = "meteo_social_session";
const SOCIAL_SESSION_MS = 12 * 60 * 60 * 1000;

function badRequest(request, env, message) { return jsonResponse(request, env, { ok: false, error: message }, 400); }
function dateParts(value) { return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: ARGENTINA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }
function argentinaDate(now = new Date()) { const parts = dateParts(now); return `${parts.year}-${parts.month}-${parts.day}`; }
function parsedDate(date) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); if (!match) return null; const [year, month, day] = match.slice(1).map(Number); const probe = new Date(Date.UTC(year, month - 1, day)); return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day ? { year, month, day } : null; }
function localMidnightToUtc(date) { const parsed = parsedDate(date); if (!parsed) return null; const candidate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)); const local = dateParts(candidate); const localAsUtc = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute)); return new Date(candidate.getTime() - (localAsUtc - candidate.getTime())).toISOString(); }
function nextDate(date) { const parsed = parsedDate(date); return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1)).toISOString().slice(0, 10); }
function previousDate(date) { const parsed = parsedDate(date); return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day - 1)).toISOString().slice(0, 10); }
function argentinaDateToUtcRange(date) { return { start: localMidnightToUtc(date), end: localMidnightToUtc(nextDate(date)) }; }
function formatArgentinaDateTime(timestamp) { const parts = dateParts(new Date(timestamp)); return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`; }
function isValidArgentinaDate(date) { return parsedDate(date) !== null; }
function validPastDate(date) { return isValidArgentinaDate(date) && date <= argentinaDate(); }
function dayRange(date) { return argentinaDateToUtcRange(date); }
function parseHistoryRange(url) {
  const hours = url.searchParams.get("hours"); const days = url.searchParams.get("days");
  if ((hours && days) || (!hours && !days)) return null;
  if (hours && HISTORY_LIMITS.hours.includes(Number(hours))) return { kind: "hours", value: Number(hours) };
  if (days && HISTORY_LIMITS.days.includes(Number(days))) return { kind: "days", value: Number(days) };
  return null;
}
function rainTotal(rows) {
  let total = 0; let previous = null;
  rows.forEach((row) => {
    if (!Number.isFinite(row.precip_total)) return;
    if (previous !== null) total += row.precip_total >= previous ? row.precip_total - previous : row.precip_total;
    previous = row.precip_total;
  });
  return previous === null ? null : total;
}
function validDailyValue(value, key) { const [minimum, maximum] = DAILY_VALID_LIMITS[key]; return Number.isFinite(value) && value >= minimum && value <= maximum; }
function dailyPrecipitationTotal(rows) {
  let total = 0; let previous = null; let available = false;
  rows.forEach((row) => {
    if (!validDailyValue(row.precip_total, "precipTotal")) return;
    available = true;
    if (previous === null) total += row.precip_total;
    else total += row.precip_total >= previous ? row.precip_total - previous : row.precip_total;
    previous = row.precip_total;
  });
  return available ? total : null;
}
function rangeFromPeriod(period) { const duration = COMPARE_PERIODS[period]; return duration ? { start: new Date(Date.now() - duration).toISOString(), end: new Date().toISOString(), duration } : null; }
function csvValue(value) { return value === null || value === undefined ? "" : String(value).replaceAll('"', '""'); }
function privateResponse(body, status = 200, headers = new Headers()) { headers.set("Content-Type", "application/json; charset=utf-8"); headers.set("Cache-Control", "no-store"); return new Response(JSON.stringify(body), { status, headers }); }
function base64url(value) { return btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function fromBase64url(value) { const base = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(base), (character) => character.charCodeAt(0)); }
async function hmac(secret, text) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))); }
async function constantEquals(left, right) { const a = new TextEncoder().encode(left || ""); const b = new TextEncoder().encode(right || ""); let difference = a.length ^ b.length; for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0); return difference === 0; }
function cookieValue(request, name) { return (request.headers.get("Cookie") || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null; }
async function socialSession(request, env) { const token = cookieValue(request, SOCIAL_COOKIE); if (!token || !env.SOCIAL_SESSION_SECRET) return null; const [payload, signature] = token.split("."); if (!payload || !signature || !(await constantEquals(signature, await hmac(env.SOCIAL_SESSION_SECRET, payload)))) return null; try { const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))); return data.exp > Date.now() ? data : null; } catch { return null; } }
async function requireSocialSession(request, env, mutation = false) { const session = await socialSession(request, env); if (!session || (mutation && request.headers.get("X-CSRF-Token") !== session.csrf)) return null; return session; }
function socialCookie(value, maxAge = SOCIAL_SESSION_MS / 1000) { return `${SOCIAL_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}`; }
async function loginAllowed(request, env) { const raw = request.headers.get("CF-Connecting-IP") || "unknown"; const key = await hmac(env.SOCIAL_SESSION_SECRET || "", raw); const row = await env.HISTORY_DB.prepare("SELECT * FROM social_login_limits WHERE client_hash = ?").bind(key).first(); return { key, allowed: !row || !row.locked_until || row.locked_until <= Date.now() }; }
async function loginFailure(database, key) { const now = Date.now(); const row = await database.prepare("SELECT * FROM social_login_limits WHERE client_hash = ?").bind(key).first(); const attempts = !row || now - row.window_started_at > 900000 ? 1 : row.attempts + 1; const locked = attempts >= 5 ? now + 900000 : null; await database.prepare("INSERT INTO social_login_limits (client_hash, attempts, window_started_at, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(client_hash) DO UPDATE SET attempts=excluded.attempts, window_started_at=excluded.window_started_at, locked_until=excluded.locked_until").bind(key, attempts, !row || now - (row.window_started_at || 0) > 900000 ? now : row.window_started_at, locked).run(); }
async function socialLogin(request, env) { if (!env.SOCIAL_PANEL_PASSWORD || !env.SOCIAL_SESSION_SECRET) return privateResponse({ ok: false, error: "Panel no configurado." }, 503); const attempt = await loginAllowed(request, env); if (!attempt.allowed) return privateResponse({ ok: false, error: "Acceso temporalmente bloqueado." }, 429); let body; try { body = await request.json(); } catch { return privateResponse({ ok: false, error: "Credenciales inválidas." }, 400); } if (!(await constantEquals(String(body.password || ""), env.SOCIAL_PANEL_PASSWORD))) { await loginFailure(env.HISTORY_DB, attempt.key); return privateResponse({ ok: false, error: "Credenciales inválidas." }, 401); } await env.HISTORY_DB.prepare("DELETE FROM social_login_limits WHERE client_hash = ?").bind(attempt.key).run(); const csrf = crypto.randomUUID(); const payload = base64url(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + SOCIAL_SESSION_MS, csrf }))); const headers = new Headers({ "Set-Cookie": socialCookie(`${payload}.${await hmac(env.SOCIAL_SESSION_SECRET, payload)}`) }); return privateResponse({ ok: true, csrf }, 200, headers); }
function socialRow(row) { return serializeSocialForecast(row); }
async function socialToday(request, env) { if (!(await requireSocialSession(request, env))) return privateResponse({ ok: false, error: "No autorizado." }, 401); const row = await env.HISTORY_DB.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(socialDate()).first(); return privateResponse({ ok: true, data: socialRow(row) }); }
async function socialSessionInfo(request, env) { const session = await requireSocialSession(request, env); return session ? privateResponse({ ok: true, csrf: session.csrf }) : privateResponse({ ok: false, error: "No autorizado." }, 401); }
async function socialHistory(request, env) { if (!(await requireSocialSession(request, env))) return privateResponse({ ok: false, error: "No autorizado." }, 401); const rows = await env.HISTORY_DB.prepare("SELECT * FROM social_forecasts ORDER BY forecast_date DESC LIMIT 30").all(); return privateResponse({ ok: true, data: rows.results.map(socialRow) }); }
async function regenerateSocial(request, env) { if (!(await requireSocialSession(request, env, true))) return privateResponse({ ok: false, error: "No autorizado." }, 401); try { return privateResponse({ ok: true, data: socialRow(await saveSocialForecast(env.HISTORY_DB, await buildSocialForecast(env.HISTORY_DB, env), true)) }); } catch { return privateResponse({ ok: false, error: "No fue posible generar el pronóstico con Meteored." }, 503); } }
async function saveSocial(request, env) { if (!(await requireSocialSession(request, env, true))) return privateResponse({ ok: false, error: "No autorizado." }, 401); let body; try { body = await request.json(); } catch { return privateResponse({ ok: false, error: "Texto inválido." }, 400); } const text = String(body.text || "").trim(); if (!text || text.length > 3000) return privateResponse({ ok: false, error: "Texto inválido." }, 400); const date = socialDate(); const row = await env.HISTORY_DB.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(date).first(); if (!row) return privateResponse({ ok: false, error: "No hay pronóstico para editar." }, 404); const parts = [text]; await env.HISTORY_DB.prepare("UPDATE social_forecasts SET final_text = ?, parts_json = ?, parts_count = 1, status = 'edited', updated_at = ? WHERE forecast_date = ?").bind(text, JSON.stringify(parts), new Date().toISOString(), date).run(); return privateResponse({ ok: true, data: socialRow(await env.HISTORY_DB.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(date).first()) }); }
function parsedMonth(value) { const match = /^(\d{4})-(\d{2})$/.exec(value || ""); if (!match) return null; const [year, month] = match.slice(1).map(Number); return month >= 1 && month <= 12 ? { year, month } : null; }
function parsedYear(value) { return /^\d{4}$/.test(value || "") ? Number(value) : null; }
function monthStart(month) { const parsed = parsedMonth(month); return parsed ? `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-01` : null; }
function nextMonth(month) { const parsed = parsedMonth(month); return parsed ? new Date(Date.UTC(parsed.year, parsed.month, 1)).toISOString().slice(0, 7) : null; }
function previousMonth(month) { const parsed = parsedMonth(month); return parsed ? new Date(Date.UTC(parsed.year, parsed.month - 2, 1)).toISOString().slice(0, 7) : null; }
function nextYear(year) { return `${Number(year) + 1}`; }
function localYear(value) { return dateParts(new Date(value)).year; }
function localMonth(value) { const parts = dateParts(new Date(value)); return `${parts.year}-${parts.month}`; }
function rangeForStatistic(period, value, info) {
  const now = new Date().toISOString(); const today = argentinaDate(); const currentMonth = today.slice(0, 7); const currentYear = today.slice(0, 4);
  if (period === "month") {
    if (!parsedMonth(value) || value > currentMonth) return null;
    const start = localMidnightToUtc(monthStart(value)); const end = value === currentMonth ? now : localMidnightToUtc(monthStart(nextMonth(value)));
    return { start, end, label: value, partial: value === currentMonth };
  }
  if (period === "year") {
    if (!parsedYear(value) || value > currentYear) return null;
    const start = localMidnightToUtc(`${value}-01-01`); const end = value === currentYear ? now : localMidnightToUtc(`${nextYear(value)}-01-01`);
    return { start, end, label: value, partial: value === currentYear };
  }
  if (period === "all" && info && info.first_observation && info.last_observation) return { start: info.first_observation, end: new Date(Date.parse(info.last_observation) + 1000).toISOString(), label: "all", partial: true };
  return null;
}
function coverageForRange(observations, start, end) {
  const expectedObservations = Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / DAILY_INTERVAL_MS));
  const percentage = Math.min(100, Math.round((observations / expectedObservations) * 100));
  return { expectedObservations, percentage, level: percentage >= STATISTICS_COVERAGE_GOOD ? "good" : percentage >= STATISTICS_COVERAGE_PARTIAL ? "partial" : "insufficient" };
}

export async function captureWeatherObservation(env) {
  const observation = await fetchWeatherObservation(env);
  const outcome = await insertObservation(env.HISTORY_DB, observation);
  console.log(outcome.inserted ? `Captura almacenada: ${outcome.observedAt}` : `Duplicado ignorado: ${outcome.observedAt}`);
  return outcome;
}

async function rawRows(database, start, end) {
  const result = await database.prepare("SELECT * FROM weather_observations WHERE observed_at >= ? AND observed_at < ? ORDER BY observed_at ASC LIMIT 9000").bind(start, end).all();
  return result.results;
}
async function aggregateStats(database, start, end) {
  const summary = await database.prepare(`SELECT COUNT(*) AS observations, AVG(temperature) AS temperature_avg, MIN(temperature) AS temperature_min, MAX(temperature) AS temperature_max,
    AVG(humidity) AS humidity_avg, AVG(pressure) AS pressure_avg, AVG(wind_speed) AS wind_avg, MAX(wind_speed) AS wind_max, MAX(wind_gust) AS wind_gust_max
    FROM weather_observations WHERE observed_at >= ? AND observed_at < ?`).bind(start, end).first();
  if (!summary || !summary.observations) return null;
  const precipitation = rainTotal(await rawRows(database, start, end));
  return { observations: summary.observations, temperatureAvg: summary.temperature_avg, temperatureMin: summary.temperature_min, temperatureMax: summary.temperature_max, humidityAvg: summary.humidity_avg, pressureAvg: summary.pressure_avg, windAvg: summary.wind_avg, windMax: summary.wind_max, windGustMax: summary.wind_gust_max, precipitation };
}
async function dailyExtreme(database, column, minimum, maximum, order, start, end) {
  return database.prepare(`SELECT ${column} AS value, observed_at FROM weather_observations WHERE observed_at >= ? AND observed_at < ? AND ${column} BETWEEN ? AND ? ORDER BY ${column} ${order}, observed_at ASC LIMIT 1`).bind(start, end, minimum, maximum).first();
}
async function dailySummaryData(database, start, end) {
  const aggregatePromise = database.prepare(`SELECT COUNT(*) AS observations, MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation,
    MIN(CASE WHEN temperature BETWEEN -90 AND 70 THEN temperature END) AS temperature_min, MAX(CASE WHEN temperature BETWEEN -90 AND 70 THEN temperature END) AS temperature_max,
    MIN(CASE WHEN humidity BETWEEN 0 AND 100 THEN humidity END) AS humidity_min, MAX(CASE WHEN humidity BETWEEN 0 AND 100 THEN humidity END) AS humidity_max,
    MIN(CASE WHEN pressure BETWEEN 800 AND 1100 THEN pressure END) AS pressure_min, MAX(CASE WHEN pressure BETWEEN 800 AND 1100 THEN pressure END) AS pressure_max,
    MAX(CASE WHEN wind_speed BETWEEN 0 AND 300 THEN wind_speed END) AS wind_max,
    MAX(CASE WHEN wind_gust BETWEEN 0 AND 400 THEN wind_gust END) AS gust_max
    FROM weather_observations WHERE observed_at >= ? AND observed_at < ?`).bind(start, end).first();
  const precipitationPromise = database.prepare("SELECT observed_at, precip_total FROM weather_observations WHERE observed_at >= ? AND observed_at < ? AND precip_total IS NOT NULL ORDER BY observed_at ASC LIMIT 300").bind(start, end).all();
  const [aggregate, temperatureMin, temperatureMax, windMax, gustMax, precipitation] = await Promise.all([
    aggregatePromise,
    dailyExtreme(database, "temperature", -90, 70, "ASC", start, end),
    dailyExtreme(database, "temperature", -90, 70, "DESC", start, end),
    dailyExtreme(database, "wind_speed", 0, 300, "DESC", start, end),
    dailyExtreme(database, "wind_gust", 0, 400, "DESC", start, end),
    precipitationPromise
  ]);
  if (!aggregate || !aggregate.observations) return null;
  const expectedObservations = Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / DAILY_INTERVAL_MS));
  const firstGap = aggregate.first_observation ? Date.parse(aggregate.first_observation) - Date.parse(start) : Infinity;
  const lastGap = aggregate.last_observation ? Date.parse(end) - Date.parse(aggregate.last_observation) : Infinity;
  return {
    observations: aggregate.observations,
    firstObservation: aggregate.first_observation,
    lastObservation: aggregate.last_observation,
    coverage: { expectedObservations, percentage: Math.min(100, Math.round((aggregate.observations / expectedObservations) * 100)), partial: firstGap > DAILY_INTERVAL_MS * 2 || lastGap > DAILY_INTERVAL_MS * 2 },
    temperature: { min: aggregate.temperature_min, minAt: temperatureMin && temperatureMin.observed_at, max: aggregate.temperature_max, maxAt: temperatureMax && temperatureMax.observed_at },
    humidity: { min: aggregate.humidity_min, max: aggregate.humidity_max },
    pressure: { min: aggregate.pressure_min, max: aggregate.pressure_max },
    wind: { max: aggregate.wind_max, maxAt: windMax && windMax.observed_at },
    gust: { max: aggregate.gust_max, maxAt: gustMax && gustMax.observed_at },
    precipitation: { total: dailyPrecipitationTotal(precipitation.results) }
  };
}
async function statisticRows(database, start, end) {
  const rows = []; let cursor = "";
  while (true) {
    const result = await database.prepare("SELECT observed_at, temperature, precip_total FROM weather_observations WHERE observed_at >= ? AND observed_at < ? AND observed_at > ? ORDER BY observed_at ASC LIMIT 5000").bind(start, end, cursor).all();
    rows.push(...result.results);
    if (result.results.length < 5000) return rows;
    cursor = result.results.at(-1).observed_at;
  }
}
function localDateCache() {
  const cache = new Map();
  return (timestamp) => {
    const utcDate = timestamp.slice(0, 10); let entry = cache.get(utcDate);
    if (!entry) {
      const localDate = argentinaDate(new Date(`${utcDate}T12:00:00.000Z`));
      entry = { localDate, localMidnight: localMidnightToUtc(localDate) };
      cache.set(utcDate, entry);
    }
    return timestamp >= entry.localMidnight ? entry.localDate : previousDate(entry.localDate);
  };
}
function dailyStatistics(rows) {
  const days = new Map();
  const localDate = localDateCache();
  rows.forEach((row) => {
    const date = localDate(row.observed_at);
    const day = days.get(date) || { date, temperatures: [], precipitationRows: [], observations: 0 };
    day.observations += 1;
    if (validDailyValue(row.temperature, "temperature")) day.temperatures.push(row.temperature);
    day.precipitationRows.push(row);
    days.set(date, day);
  });
  return [...days.values()].map((day) => {
    const temperatures = day.temperatures;
    return { date: day.date, temperatureMin: temperatures.length ? Math.min(...temperatures) : null, temperatureMax: temperatures.length ? Math.max(...temperatures) : null, temperatureAvg: temperatures.length ? temperatures.reduce((total, value) => total + value, 0) / temperatures.length : null, precipitation: dailyPrecipitationTotal(day.precipitationRows), observations: day.observations };
  });
}
async function statisticData(database, range) {
  const aggregatePromise = database.prepare(`SELECT COUNT(*) AS observations, MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation,
    AVG(CASE WHEN temperature BETWEEN -90 AND 70 THEN temperature END) AS temperature_avg, MIN(CASE WHEN temperature BETWEEN -90 AND 70 THEN temperature END) AS temperature_min, MAX(CASE WHEN temperature BETWEEN -90 AND 70 THEN temperature END) AS temperature_max,
    AVG(CASE WHEN humidity BETWEEN 0 AND 100 THEN humidity END) AS humidity_avg, MIN(CASE WHEN humidity BETWEEN 0 AND 100 THEN humidity END) AS humidity_min, MAX(CASE WHEN humidity BETWEEN 0 AND 100 THEN humidity END) AS humidity_max,
    AVG(CASE WHEN pressure BETWEEN 800 AND 1100 THEN pressure END) AS pressure_avg, MIN(CASE WHEN pressure BETWEEN 800 AND 1100 THEN pressure END) AS pressure_min, MAX(CASE WHEN pressure BETWEEN 800 AND 1100 THEN pressure END) AS pressure_max,
    MAX(CASE WHEN wind_gust BETWEEN 0 AND 400 THEN wind_gust END) AS gust_max
    FROM weather_observations WHERE observed_at >= ? AND observed_at < ?`).bind(range.start, range.end).first();
  const rowsPromise = statisticRows(database, range.start, range.end);
  const [aggregate, temperatureMin, temperatureMax, gustMax, rows] = await Promise.all([
    aggregatePromise,
    dailyExtreme(database, "temperature", -90, 70, "ASC", range.start, range.end),
    dailyExtreme(database, "temperature", -90, 70, "DESC", range.start, range.end),
    dailyExtreme(database, "wind_gust", 0, 400, "DESC", range.start, range.end),
    rowsPromise
  ]);
  if (!aggregate || !aggregate.observations) return null;
  const daily = dailyStatistics(rows);
  const rainyDays = daily.filter((day) => Number.isFinite(day.precipitation) && day.precipitation > 0);
  const wettestDay = rainyDays.reduce((wettest, day) => !wettest || day.precipitation > wettest.precipitation ? day : wettest, null);
  const precipitation = daily.some((day) => Number.isFinite(day.precipitation)) ? daily.reduce((total, day) => total + (Number.isFinite(day.precipitation) ? day.precipitation : 0), 0) : null;
  return {
    firstObservation: aggregate.first_observation, lastObservation: aggregate.last_observation, observations: aggregate.observations,
    coverage: coverageForRange(aggregate.observations, range.start, range.end),
    temperature: { min: aggregate.temperature_min, minAt: temperatureMin && temperatureMin.observed_at, max: aggregate.temperature_max, maxAt: temperatureMax && temperatureMax.observed_at, average: aggregate.temperature_avg },
    humidity: { min: aggregate.humidity_min, max: aggregate.humidity_max, average: aggregate.humidity_avg },
    pressure: { min: aggregate.pressure_min, max: aggregate.pressure_max, average: aggregate.pressure_avg },
    gust: { max: aggregate.gust_max, maxAt: gustMax && gustMax.observed_at },
    precipitation: { total: precipitation, rainyDays: rainyDays.length, wettestDay: wettestDay ? { date: wettestDay.date, total: wettestDay.precipitation } : null },
    daily
  };
}
async function statisticsInfo(database) {
  const info = await database.prepare("SELECT MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation, COUNT(*) AS total_observations FROM weather_observations").first();
  if (!info || !info.total_observations) return null;
  const rows = await statisticRows(database, info.first_observation, new Date(Date.parse(info.last_observation) + 1000).toISOString());
  const localDate = localDateCache();
  const dates = rows.map((row) => localDate(row.observed_at));
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const years = [...new Set(dates.map((date) => date.slice(0, 4)))].sort();
  return { firstObservation: info.first_observation, lastObservation: info.last_observation, totalObservations: info.total_observations, months, years };
}
function previousStatisticRange(period, value, current) {
  if (period === "all") return null;
  if (period === "month") {
    const previous = previousMonth(value); if (!previous) return null;
    const start = localMidnightToUtc(monthStart(previous));
    const end = current.partial ? new Date(Date.parse(start) + (Date.parse(current.end) - Date.parse(current.start))).toISOString() : localMidnightToUtc(monthStart(nextMonth(previous)));
    return { start, end, label: previous, partial: current.partial };
  }
  const previous = `${Number(value) - 1}`; const start = localMidnightToUtc(`${previous}-01-01`);
  const end = current.partial ? new Date(Date.parse(start) + (Date.parse(current.end) - Date.parse(current.start))).toISOString() : localMidnightToUtc(`${value}-01-01`);
  return { start, end, label: previous, partial: current.partial };
}
async function getStatistics(request, env, url) {
  const period = url.searchParams.get("period"); const value = url.searchParams.get("value") || "";
  const info = await env.HISTORY_DB.prepare("SELECT MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation, COUNT(*) AS total_observations FROM weather_observations").first();
  if (!info || !info.total_observations) return jsonResponse(request, env, { ok: true, data: null });
  const range = rangeForStatistic(period, value, info);
  if (!range) return badRequest(request, env, "Período estadístico inválido.");
  const data = await statisticData(env.HISTORY_DB, range);
  const previousRange = previousStatisticRange(period, value, range);
  const previous = previousRange ? await statisticData(env.HISTORY_DB, previousRange) : null;
  const sufficient = Boolean(data && previous && data.coverage.percentage >= STATISTICS_COVERAGE_PARTIAL && previous.coverage.percentage >= STATISTICS_COVERAGE_PARTIAL);
  return jsonResponse(request, env, { ok: true, timezone: ARGENTINA_TIME_ZONE, period, value: range.label, range, data, comparison: previousRange ? { value: previousRange.label, sameElapsed: range.partial, data: previous, sufficient } : null });
}
async function getStatisticsInfo(request, env) { return jsonResponse(request, env, { ok: true, timezone: ARGENTINA_TIME_ZONE, data: await statisticsInfo(env.HISTORY_DB) }); }
async function getCurrent(request, env) {
  const row = await env.HISTORY_DB.prepare("SELECT * FROM weather_observations ORDER BY observed_at DESC LIMIT 1").first();
  if (!row) return jsonResponse(request, env, { ok: true, data: null, message: "Aún no hay observaciones históricas." });
  return jsonResponse(request, env, { ok: true, data: serializeObservation(row) });
}
async function getForecast(request, env, url) { const type = url.pathname.split("/").at(-1); try { return jsonResponse(request, env, { ok: true, data: await publicForecast(env.HISTORY_DB, env, type), expiracion: Date.now() + 60000 }); } catch { return jsonResponse(request, env, { ok: false, error: "Pronóstico no disponible." }, 503); } }
async function getHistory(request, env, url) {
  const date = url.searchParams.get("date");
  if (date !== null) {
    if (!validPastDate(date)) return badRequest(request, env, "La fecha debe ser YYYY-MM-DD y no puede ser futura.");
    const range = dayRange(date); const rows = await rawRows(env.HISTORY_DB, range.start, range.end);
    return jsonResponse(request, env, { ok: true, range: `date:${date}`, timezone: "America/Argentina/Buenos_Aires", aggregated: false, data: rows.map(serializeObservation) });
  }
  const range = parseHistoryRange(url);
  if (!range) return badRequest(request, env, "Usá exactamente hours=24, days=7, days=30 o date=YYYY-MM-DD.");
  const since = new Date(Date.now() - range.value * (range.kind === "hours" ? 3600000 : 86400000)).toISOString();
  let query;
  if (range.kind === "hours") query = env.HISTORY_DB.prepare("SELECT * FROM weather_observations WHERE observed_at >= ? ORDER BY observed_at ASC LIMIT 300").bind(since);
  else query = env.HISTORY_DB.prepare(`SELECT substr(observed_at, 1, 13) || ':00:00.000Z' AS observed_at, AVG(temperature) AS temperature, AVG(feels_like) AS feels_like, AVG(humidity) AS humidity, AVG(pressure) AS pressure, AVG(wind_speed) AS wind_speed, MAX(wind_gust) AS wind_gust, MAX(precip_rate) AS precip_rate, MAX(precip_total) AS precip_total FROM weather_observations WHERE observed_at >= ? GROUP BY substr(observed_at, 1, 13) ORDER BY observed_at ASC LIMIT 720`).bind(since);
  const result = await query.all();
  return jsonResponse(request, env, { ok: true, range: `${range.kind}:${range.value}`, aggregated: range.kind === "days", data: result.results.map(serializeObservation) });
}
async function getHistoryInfo(request, env) {
  const row = await env.HISTORY_DB.prepare("SELECT MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation, COUNT(*) AS total_observations FROM weather_observations").first();
  return jsonResponse(request, env, { ok: true, data: row && row.total_observations ? { firstObservation: row.first_observation, lastObservation: row.last_observation, totalObservations: row.total_observations } : null });
}
async function getDailyStats(request, env, date) {
  if (!validPastDate(date)) return badRequest(request, env, "La fecha debe ser YYYY-MM-DD y no puede ser futura.");
  const range = dayRange(date); const data = await aggregateStats(env.HISTORY_DB, range.start, range.end);
  return jsonResponse(request, env, { ok: true, date, timezone: "America/Argentina/Buenos_Aires", data });
}
async function getDailySummary(request, env, url) {
  const date = url.searchParams.get("date") || argentinaDate();
  if (!validPastDate(date)) return badRequest(request, env, "La fecha debe ser YYYY-MM-DD y no puede ser futura.");
  const range = dayRange(date); const isCurrentDay = date === argentinaDate();
  const end = isCurrentDay ? new Date().toISOString() : range.end;
  const data = await dailySummaryData(env.HISTORY_DB, range.start, end);
  const comparisonDate = previousDate(date); const comparisonRange = dayRange(comparisonDate);
  const elapsed = Date.parse(end) - Date.parse(range.start);
  const comparisonEnd = isCurrentDay ? new Date(Date.parse(comparisonRange.start) + elapsed).toISOString() : comparisonRange.end;
  const comparison = await dailySummaryData(env.HISTORY_DB, comparisonRange.start, comparisonEnd);
  return jsonResponse(request, env, { ok: true, date, timezone: ARGENTINA_TIME_ZONE, isCurrentDay, data, comparison: comparison ? { date: comparisonDate, sameElapsed: isCurrentDay, data: comparison } : null });
}
async function getCompare(request, env, url) {
  const period = url.searchParams.get("period"); const current = rangeFromPeriod(period);
  if (!current) return badRequest(request, env, "El período debe ser 24h, 7d o 30d.");
  const previous = { start: new Date(Date.parse(current.start) - current.duration).toISOString(), end: current.start };
  const [currentData, previousData] = await Promise.all([aggregateStats(env.HISTORY_DB, current.start, current.end), aggregateStats(env.HISTORY_DB, previous.start, previous.end)]);
  return jsonResponse(request, env, { ok: true, period, current: currentData, previous: previousData, sufficient: Boolean(currentData && previousData) });
}
async function recordAt(database, column, order) { return database.prepare(`SELECT ${column} AS value, observed_at FROM weather_observations WHERE ${column} IS NOT NULL ORDER BY ${column} ${order}, observed_at ASC LIMIT 1`).first(); }
async function getRecords(request, env) {
  const info = await env.HISTORY_DB.prepare("SELECT MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation, COUNT(*) AS total_observations FROM weather_observations").first();
  if (!info || !info.total_observations) return jsonResponse(request, env, { ok: true, data: null });
  const [temperatureMax, temperatureMin, gustMax, pressureMax, pressureMin, humidityMax, humidityMin, allData] = await Promise.all([recordAt(env.HISTORY_DB, "temperature", "DESC"), recordAt(env.HISTORY_DB, "temperature", "ASC"), recordAt(env.HISTORY_DB, "wind_gust", "DESC"), recordAt(env.HISTORY_DB, "pressure", "DESC"), recordAt(env.HISTORY_DB, "pressure", "ASC"), recordAt(env.HISTORY_DB, "humidity", "DESC"), recordAt(env.HISTORY_DB, "humidity", "ASC"), statisticData(env.HISTORY_DB, rangeForStatistic("all", "", info))]);
  return jsonResponse(request, env, { ok: true, data: { firstObservation: info.first_observation, lastObservation: info.last_observation, totalObservations: info.total_observations, temperature: { max: temperatureMax && temperatureMax.value, maxAt: temperatureMax && temperatureMax.observed_at, min: temperatureMin && temperatureMin.value, minAt: temperatureMin && temperatureMin.observed_at }, windGust: { max: gustMax && gustMax.value, maxAt: gustMax && gustMax.observed_at }, pressure: { max: pressureMax && pressureMax.value, maxAt: pressureMax && pressureMax.observed_at, min: pressureMin && pressureMin.value, minAt: pressureMin && pressureMin.observed_at }, humidity: { max: humidityMax && humidityMax.value, maxAt: humidityMax && humidityMax.observed_at, min: humidityMin && humidityMin.value, minAt: humidityMin && humidityMin.observed_at }, precipitation: allData && allData.precipitation } });
}
async function exportCsv(request, env, url) {
  const period = url.searchParams.get("period"); const date = url.searchParams.get("date"); let range;
  if (date !== null) { if (!validPastDate(date)) return badRequest(request, env, "La fecha debe ser YYYY-MM-DD y no puede ser futura."); range = dayRange(date); }
  else { range = rangeFromPeriod(period); if (!range) return badRequest(request, env, "El período debe ser 24h, 7d o 30d."); }
  const rows = await rawRows(env.HISTORY_DB, range.start, range.end);
  const csv = `\uFEFF${CSV_HEADER.join(";")}\r\n${rows.map((row) => [formatArgentinaDateTime(row.observed_at), row.temperature, row.feels_like, row.humidity, row.pressure, row.wind_speed, row.wind_gust, row.wind_direction, row.wind_direction_degrees, row.precip_rate, row.precip_total, row.dew_point].map(csvValue).join(";")).join("\r\n")}\r\n`;
  const headers = corsHeaders(request, env); headers.set("Content-Type", "text/csv; charset=utf-8"); headers.set("Content-Disposition", `attachment; filename="meteo-ituzaingo-${date || period}.csv"`); headers.set("Cache-Control", "no-store");
  return new Response(csv, { headers });
}
function socialPanel() { return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Panel privado | Meteo Ituzaingó</title><style>body{margin:0;background:#eef5f8;color:#17364f;font:16px Arial,sans-serif}main{max-width:720px;margin:24px auto;padding:20px}section{background:#fff;border:1px solid #d8e5ed;border-radius:16px;padding:20px;margin-bottom:16px}input,textarea,button{box-sizing:border-box;width:100%;padding:12px;margin:7px 0;border:1px solid #b8ccd9;border-radius:9px;font:inherit}button{background:#0c5d93;color:#fff;border:0;font-weight:bold;min-height:44px}button.secondary{background:#eef5f8;color:#0c5d93}textarea{min-height:230px;line-height:1.45}small,p{line-height:1.45}#app{display:none}.part{border-top:1px solid #d8e5ed;padding-top:12px;margin-top:12px;white-space:pre-wrap}.status{color:#587181}</style></head><body><main><section id="login"><p>METEO ITUZAINGÓ</p><h1>Panel privado</h1><form id="loginForm"><label>Contraseña<input id="password" type="password" autocomplete="current-password" required></label><button>Ingresar</button></form><p id="loginStatus" class="status"></p></section><div id="app"><section><p>PRONÓSTICO PARA REDES</p><h1 id="title">Hoy</h1><p id="meta" class="status"></p><textarea id="text" aria-label="Texto del pronóstico"></textarea><button id="save">Guardar cambios</button><button id="regenerate" class="secondary">Regenerar pronóstico</button><button id="logout" class="secondary">Cerrar sesión</button><p id="status" class="status"></p></section><section><h2>Publicaciones</h2><div id="parts"></div></section><section><h2>Historial</h2><div id="history"></div></section></div></main><script src="/admin/redes.js"></script></body></html>`; }
function socialScript() { return String.raw`(()=>{
  let csrf=''; const $=id=>document.getElementById(id);
  const api=async(path,options={})=>{const response=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.mutation?{'X-CSRF-Token':csrf}:{})},...options});const body=await response.json();if(!response.ok||!body||!body.ok)throw new Error((body&&body.error)||'No se pudo completar la operación.');return options.raw?body:body.data};
  const copy=async text=>{try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove()}};
  function show(data){$('app').style.display='block';$('login').style.display='none';if(!data){$('title').textContent='No hay un pronóstico generado para hoy.';$('text').value='';$('parts').textContent='Usá Regenerar pronóstico para intentar crearlo.';return}$('title').textContent='Pronóstico para '+data.date;$('meta').textContent=data.status+' · '+data.source+' · generado '+new Date(data.generatedAt).toLocaleString('es-AR');$('text').value=data.finalText||data.originalText||'';$('parts').replaceChildren(...data.parts.map((part,index)=>{const item=document.createElement('div');item.className='part';const content=document.createElement('pre');content.textContent=(index+1)+'/'+data.parts.length+'\n'+part;const button=document.createElement('button');button.className='secondary';button.textContent='Copiar publicación';button.onclick=()=>copy(part);item.append(content,button);return item}))}
  async function load(){show(await api('/api/admin/social-forecast/today'));const history=await api('/api/admin/social-forecast/history');$('history').replaceChildren(...history.map(item=>{const button=document.createElement('button');button.className='secondary';button.textContent=item.date+' — '+item.status+' — '+item.partsCount+' publicación(es)';button.onclick=()=>show(item);return button}))}
  async function restoreSession(){try{const session=await api('/api/admin/session',{raw:true});if(!session.csrf)throw new Error('Sesión sin token de seguridad.');csrf=session.csrf;await load()}catch{$('app').style.display='none';$('login').style.display='block'}}
  $('loginForm').onsubmit=async event=>{event.preventDefault();$('loginStatus').textContent='';try{const result=await api('/api/admin/login',{method:'POST',raw:true,body:JSON.stringify({password:$('password').value})});if(!result.csrf)throw new Error('La sesión se inició pero no se recibió el token de seguridad.');csrf=result.csrf;$('password').value='';await load()}catch(error){$('loginStatus').textContent=error.message||'No se pudo iniciar sesión.'}};
  $('save').onclick=async()=>{try{show(await api('/api/admin/social-forecast',{method:'PUT',mutation:true,body:JSON.stringify({text:$('text').value})}));$('status').textContent='Cambios guardados.'}catch(error){$('status').textContent=error.message}};
  $('regenerate').onclick=async()=>{if(!confirm('Esto reemplazará la edición actual. ¿Continuar?'))return;try{show(await api('/api/admin/social-forecast/regenerate',{method:'POST',mutation:true}));$('status').textContent='Pronóstico regenerado.'}catch(error){$('status').textContent=error.message}};
  $('logout').onclick=async()=>{try{await api('/api/admin/logout',{method:'POST',raw:true})}finally{location.reload()}};
  restoreSession();
})()`; }
function isAuthorizedCapture(request, env) { return Boolean(env.ADMIN_TOKEN) && (request.headers.get("Authorization") || "") === `Bearer ${env.ADMIN_TOKEN}`; }
async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.method === "GET" && url.pathname === "/admin/redes") return new Response(socialPanel(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  if (request.method === "GET" && url.pathname === "/admin/redes.js") return new Response(socialScript(), { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (request.method === "POST" && url.pathname === "/api/admin/login") return socialLogin(request, env);
  if (request.method === "POST" && url.pathname === "/api/admin/logout") return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": socialCookie("", 0) } });
  if (request.method === "GET" && url.pathname === "/api/admin/session") return socialSessionInfo(request, env);
  if (request.method === "GET" && url.pathname === "/api/admin/social-forecast/today") return socialToday(request, env);
  if (request.method === "GET" && url.pathname === "/api/admin/social-forecast/history") return socialHistory(request, env);
  if (request.method === "POST" && url.pathname === "/api/admin/social-forecast/regenerate") return regenerateSocial(request, env);
  if (request.method === "PUT" && url.pathname === "/api/admin/social-forecast") return saveSocial(request, env);
  if (request.method === "GET" && url.pathname === "/api/current") return getCurrent(request, env);
  if (request.method === "GET" && ["/api/forecast/hourly", "/api/forecast/daily"].includes(url.pathname)) return getForecast(request, env, url);
  if (request.method === "GET" && url.pathname === "/api/history") return getHistory(request, env, url);
  if (request.method === "GET" && url.pathname === "/api/history/info") return getHistoryInfo(request, env);
  if (request.method === "GET" && url.pathname === "/api/stats/today") return getDailyStats(request, env, argentinaDate());
  if (request.method === "GET" && url.pathname === "/api/stats/daily") return getDailyStats(request, env, url.searchParams.get("date") || "");
  if (request.method === "GET" && url.pathname === "/api/daily-summary") return getDailySummary(request, env, url);
  if (request.method === "GET" && url.pathname === "/api/statistics/info") return getStatisticsInfo(request, env);
  if (request.method === "GET" && url.pathname === "/api/statistics") return getStatistics(request, env, url);
  if (request.method === "GET" && url.pathname === "/api/compare") return getCompare(request, env, url);
  if (request.method === "GET" && url.pathname === "/api/records") return getRecords(request, env);
  if (request.method === "GET" && url.pathname === "/api/export.csv") return exportCsv(request, env, url);
  if (request.method === "POST" && url.pathname === "/api/admin/capture") { if (!isAuthorizedCapture(request, env)) return jsonResponse(request, env, { ok: false, error: "No autorizado." }, 401); const outcome = await captureWeatherObservation(env); return jsonResponse(request, env, { ok: true, data: outcome }, outcome.inserted ? 201 : 200); }
  if (["GET", "POST"].includes(request.method)) return jsonResponse(request, env, { ok: false, error: "Ruta no encontrada." }, 404);
  return jsonResponse(request, env, { ok: false, error: "Método no permitido." }, 405);
}
export default { async fetch(request, env) { try { return await route(request, env); } catch (error) { console.error("Error de API histórica:", error instanceof Error ? error.message : "error desconocido"); return jsonResponse(request, env, { ok: false, error: "No fue posible procesar la solicitud." }, 500); } }, async scheduled(event, env, ctx) { if (event.cron === SOCIAL_CRON) { ctx.waitUntil(buildSocialForecast(env.HISTORY_DB, env).then((forecast) => saveSocialForecast(env.HISTORY_DB, forecast)).catch((error) => console.error("Error de pronóstico social:", error instanceof Error ? error.message : "error desconocido"))); } else ctx.waitUntil(captureWeatherObservation(env).catch((error) => console.error("Error de captura programada:", error instanceof Error ? error.message : "error desconocido"))); } };
