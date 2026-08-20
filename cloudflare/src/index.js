import { corsHeaders, jsonResponse } from "./cors.js";
import { insertObservation, serializeObservation } from "./database.js";
import { fetchWeatherObservation } from "./weather.js";

const ARGENTINA_OFFSET = "-03:00";
const HISTORY_LIMITS = { hours: [24], days: [7, 30] };

function badRequest(request, env, message) { return jsonResponse(request, env, { ok: false, error: message }, 400); }

function parseHistoryRange(url) {
  const hours = url.searchParams.get("hours"); const days = url.searchParams.get("days");
  if ((hours && days) || (!hours && !days)) return null;
  if (hours && HISTORY_LIMITS.hours.includes(Number(hours))) return { kind: "hours", value: Number(hours) };
  if (days && HISTORY_LIMITS.days.includes(Number(days))) return { kind: "days", value: Number(days) };
  return null;
}

function argentinaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function utcStartForArgentinaDate(date) { return new Date(`${date}T00:00:00${ARGENTINA_OFFSET}`).toISOString(); }

function isValidArgentinaDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00${ARGENTINA_OFFSET}`)); }

export async function captureWeatherObservation(env) {
  const observation = await fetchWeatherObservation(env);
  const outcome = await insertObservation(env.HISTORY_DB, observation);
  console.log(outcome.inserted ? `Captura almacenada: ${outcome.observedAt}` : `Duplicado ignorado: ${outcome.observedAt}`);
  return outcome;
}

async function getCurrent(request, env) {
  const row = await env.HISTORY_DB.prepare("SELECT * FROM weather_observations ORDER BY observed_at DESC LIMIT 1").first();
  if (!row) return jsonResponse(request, env, { ok: true, data: null, message: "Aún no hay observaciones históricas." });
  return jsonResponse(request, env, { ok: true, data: serializeObservation(row) });
}

async function getHistory(request, env, url) {
  const range = parseHistoryRange(url);
  if (!range) return badRequest(request, env, "Usá exactamente hours=24, days=7 o days=30.");
  const since = new Date(Date.now() - range.value * (range.kind === "hours" ? 3600000 : 86400000)).toISOString();
  let query;
  if (range.kind === "hours") {
    query = env.HISTORY_DB.prepare("SELECT * FROM weather_observations WHERE observed_at >= ? ORDER BY observed_at ASC LIMIT 300").bind(since);
  } else {
    query = env.HISTORY_DB.prepare(`SELECT substr(observed_at, 1, 13) || ':00:00.000Z' AS observed_at,
      AVG(temperature) AS temperature, AVG(feels_like) AS feels_like, AVG(humidity) AS humidity,
      AVG(pressure) AS pressure, AVG(wind_speed) AS wind_speed, MAX(wind_gust) AS wind_gust,
      MAX(precip_rate) AS precip_rate, MAX(precip_total) AS precip_total
      FROM weather_observations WHERE observed_at >= ? GROUP BY substr(observed_at, 1, 13) ORDER BY observed_at ASC LIMIT 720`).bind(since);
  }
  const result = await query.all();
  return jsonResponse(request, env, { ok: true, range: `${range.kind}:${range.value}`, aggregated: range.kind === "days", data: result.results.map(serializeObservation) });
}

async function getHistoryInfo(request, env) {
  const row = await env.HISTORY_DB.prepare("SELECT MIN(observed_at) AS first_observation, MAX(observed_at) AS last_observation, COUNT(*) AS total_observations FROM weather_observations").first();
  return jsonResponse(request, env, { ok: true, data: row && row.total_observations ? { firstObservation: row.first_observation, lastObservation: row.last_observation, totalObservations: row.total_observations } : null });
}

async function getDailyStats(request, env, date) {
  if (!isValidArgentinaDate(date)) return badRequest(request, env, "La fecha debe tener formato YYYY-MM-DD.");
  const start = utcStartForArgentinaDate(date); const end = utcStartForArgentinaDate(new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10));
  const row = await env.HISTORY_DB.prepare(`SELECT MIN(temperature) AS temperature_min, MAX(temperature) AS temperature_max,
    MIN(humidity) AS humidity_min, MAX(humidity) AS humidity_max, MIN(pressure) AS pressure_min,
    MAX(pressure) AS pressure_max, MAX(wind_speed) AS wind_max, MAX(wind_gust) AS wind_gust_max,
    MAX(precip_total) AS precip_total_max, COUNT(*) AS observations
    FROM weather_observations WHERE observed_at >= ? AND observed_at < ?`).bind(start, end).first();
  return jsonResponse(request, env, { ok: true, date, timezone: "America/Argentina/Buenos_Aires", data: row && row.observations ? row : null });
}

function isAuthorizedCapture(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const authorization = request.headers.get("Authorization") || "";
  return authorization === `Bearer ${env.ADMIN_TOKEN}`;
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.method === "GET" && url.pathname === "/api/current") return getCurrent(request, env);
  if (request.method === "GET" && url.pathname === "/api/history") return getHistory(request, env, url);
  if (request.method === "GET" && url.pathname === "/api/history/info") return getHistoryInfo(request, env);
  if (request.method === "GET" && url.pathname === "/api/stats/today") return getDailyStats(request, env, argentinaDate());
  if (request.method === "GET" && url.pathname === "/api/stats/daily") return getDailyStats(request, env, url.searchParams.get("date") || "");
  if (request.method === "POST" && url.pathname === "/api/admin/capture") {
    if (!isAuthorizedCapture(request, env)) return jsonResponse(request, env, { ok: false, error: "No autorizado." }, 401);
    const outcome = await captureWeatherObservation(env);
    return jsonResponse(request, env, { ok: true, data: outcome }, outcome.inserted ? 201 : 200);
  }
  if (["GET", "POST"].includes(request.method)) return jsonResponse(request, env, { ok: false, error: "Ruta no encontrada." }, 404);
  return jsonResponse(request, env, { ok: false, error: "Método no permitido." }, 405);
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); }
    catch (error) { console.error("Error de API histórica:", error instanceof Error ? error.message : "error desconocido"); return jsonResponse(request, env, { ok: false, error: "No fue posible procesar la solicitud." }, 500); }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(captureWeatherObservation(env).catch(function (error) { console.error("Error de captura programada:", error instanceof Error ? error.message : "error desconocido"); }));
  }
};
