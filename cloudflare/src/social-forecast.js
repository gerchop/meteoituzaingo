const TIME_ZONE = "America/Argentina/Buenos_Aires";
const BLOG_URL = "https://meteoituzaingo.blogspot.com/";
const MAX_POST_LENGTH = 270;
const encoder = new TextEncoder();

function localParts(value) { return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }
export function argentinaDate(value = new Date()) { const parts = localParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function number(value) { return Number.isFinite(value) ? value : null; }
function timestamp(value) { return typeof value === "number" ? value : Number(value); }
function symbolKind(symbol) { if ([34, 35, 38, 39].includes(symbol)) return "storm"; if ([12, 13, 14, 15, 16, 17, 18, 19, 28, 29].includes(symbol)) return "rain"; if ([8, 9].includes(symbol)) return "fog"; if (symbol === 5) return "cloudy"; if ([2, 3, 4].includes(symbol)) return "partly"; return "clear"; }
const SKY = { storm: "Tormentas.", rain: "Lluvias y chaparrones.", fog: "Niebla o neblina.", cloudy: "Nublado.", partly: "Parcialmente nublado.", clear: "Despejado." };
const DIRECTIONS = { N: "Norte", NNE: "Norte", NE: "Noreste", ENE: "Noreste", E: "Este", ESE: "Este", SE: "Sudeste", SSE: "Sudeste", S: "Sur", SSO: "Sudoeste", SO: "Sudoeste", OSO: "Sudoeste", O: "Oeste", ONO: "Noroeste", NO: "Noroeste", NNO: "Noroeste", W: "Oeste", SW: "Sudoeste", NW: "Noroeste" };
function roundedWind(value) { return Math.max(0, Math.round(value / 5) * 5); }
function skySummary(hours) { const kinds = hours.map((hour) => symbolKind(hour.symbol)); const rank = ["storm", "rain", "fog", "cloudy", "partly", "clear"]; const priority = rank.find((kind) => kinds.includes(kind)); if (!priority) return "Estado no informado."; const first = kinds[0]; const last = kinds.at(-1); if (["clear", "partly", "cloudy"].includes(first) && ["clear", "partly", "cloudy"].includes(last) && first !== last) {
    if (first === "partly" && last === "cloudy") return "Parcial a completamente nublado.";
    if (first === "cloudy" && last === "partly") return "Nublado a parcialmente nublado.";
    return `${SKY[first].slice(0, -1)} a ${SKY[last].toLowerCase()}`;
  }
  return SKY[priority];
}
function windSummary(hours) { const winds = hours.map((hour) => number(hour.wind_speed)).filter((value) => value !== null); if (!winds.length) return "Viento no informado."; const directions = hours.map((hour) => DIRECTIONS[String(hour.wind_direction || "").toUpperCase()]).filter(Boolean); const counts = directions.reduce((result, direction) => ({ ...result, [direction]: (result[direction] || 0) + 1 }), {}); const predominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; const direction = predominant && predominant[1] / directions.length >= .55 ? `del ${predominant[0]}` : "variables"; const sorted = winds.slice().sort((a, b) => a - b); const low = roundedWind(sorted[Math.floor((sorted.length - 1) * .2)]); const high = roundedWind(sorted[Math.ceil((sorted.length - 1) * .8)]); return `Vientos ${direction} e/${Math.min(low, high)} a ${Math.max(low, high)} km/h.`; }
function splitPosts(blocks) { const posts = []; let current = ""; blocks.forEach((block) => { const candidate = current ? `${current}\n\n${block}` : block; if (candidate.length <= MAX_POST_LENGTH) current = candidate; else { if (current) posts.push(current); current = block; } }); if (current) posts.push(current); if (posts.length > 1) return posts.map((post, index) => `${index + 1}/${posts.length}\n${post}`); return posts; }
async function cachedForecast(database, env, type) {
  const cached = await database.prepare("SELECT payload_json FROM social_forecast_cache WHERE source_type = ? AND expires_at > ?").bind(type, Date.now()).first();
  if (cached) return JSON.parse(cached.payload_json);
  if (!env.METEORED_API_KEY || !env.METEORED_LOCATION_HASH) throw new Error("Pronóstico Meteored no configurado");
  const response = await fetch(`https://api.meteored.com/api/forecast/v1/${type}/${env.METEORED_LOCATION_HASH}`, { headers: { "X-API-Key": env.METEORED_API_KEY, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Meteored respondió ${response.status}`);
  const body = await response.json(); if (!body.ok || !body.data || !Number.isFinite(body.expiracion)) throw new Error("Respuesta Meteored inválida");
  await database.prepare("INSERT INTO social_forecast_cache (source_type, expires_at, payload_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(source_type) DO UPDATE SET expires_at=excluded.expires_at, payload_json=excluded.payload_json, updated_at=excluded.updated_at").bind(type, body.expiracion, JSON.stringify(body.data), new Date().toISOString()).run();
  return body.data;
}
export async function publicForecast(database, env, type) { if (!["hourly", "daily"].includes(type)) throw new Error("Tipo de pronóstico inválido"); return cachedForecast(database, env, type); }
function dayTemperatures(hours, daily, date) { const dailyItem = (daily.days || []).find((item) => argentinaDate(new Date(timestamp(item.start))) === date); if (dailyItem && number(dailyItem.temperature_min) !== null && number(dailyItem.temperature_max) !== null) return { min: dailyItem.temperature_min, max: dailyItem.temperature_max }; const values = hours.map((hour) => number(hour.temperature)).filter((value) => value !== null); return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null; }
export async function buildSocialForecast(database, env, date = argentinaDate()) {
  const [hourly, daily] = await Promise.all([cachedForecast(database, env, "hourly"), cachedForecast(database, env, "daily")]);
  const hours = (hourly.hours || []).filter((hour) => argentinaDate(new Date(timestamp(hour.end))) === date);
  const morning = hours.filter((hour) => { const hourOfDay = Number(localParts(new Date(timestamp(hour.end))).hour); return hourOfDay >= 6 && hourOfDay < 20; });
  const night = hours.filter((hour) => Number(localParts(new Date(timestamp(hour.end))).hour) >= 20);
  const temps = dayTemperatures(hours, daily, date);
  if (!hours.length || !morning.length || !night.length || !temps) return { date, status: "incomplete", parts: [], originalText: "", sourceSummary: { hourlyHours: hours.length } };
  const morningSky = skySummary(morning); const morningWind = windSummary(morning); const nightSky = skySummary(night); const nightWind = windSummary(night);
  const blocks = [`Prono para Hoy:\n\nMañana y tarde:\n${morningSky}\n${morningWind}`, `Noche:\n${nightSky}\n${nightWind}`, `Temp.: Min.: ${Math.round(temps.min)}° - Max.: ${Math.round(temps.max)}°`, `Blog: ${BLOG_URL}`];
  const originalText = blocks.join("\n\n"); const parts = splitPosts(blocks);
  return { date, status: "generated", generatedAt: new Date().toISOString(), morningSky, morningWind, nightSky, nightWind, minTemp: temps.min, maxTemp: temps.max, originalText, parts, sourceSummary: { hourlyHours: hours.length, symbols: hours.map((hour) => hour.symbol), sourceStart: hourly.start || null } };
}
export async function saveSocialForecast(database, forecast, force = false) {
  const existing = await database.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(forecast.date).first();
  if (existing && existing.status === "edited" && !force) return existing;
  const now = new Date().toISOString(); const finalText = forecast.originalText || ""; const parts = forecast.parts || [];
  await database.prepare(`INSERT INTO social_forecasts (forecast_date, generated_at, updated_at, source, source_timestamp, generator_version, morning_summary, morning_wind, night_summary, night_wind, min_temp, max_temp, original_text, final_text, parts_json, parts_count, status, source_summary_json) VALUES (?, ?, ?, 'Meteored', ?, '1.8', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(forecast_date) DO UPDATE SET generated_at=excluded.generated_at, updated_at=excluded.updated_at, source_timestamp=excluded.source_timestamp, morning_summary=excluded.morning_summary, morning_wind=excluded.morning_wind, night_summary=excluded.night_summary, night_wind=excluded.night_wind, min_temp=excluded.min_temp, max_temp=excluded.max_temp, original_text=excluded.original_text, final_text=excluded.final_text, parts_json=excluded.parts_json, parts_count=excluded.parts_count, status=excluded.status, source_summary_json=excluded.source_summary_json`).bind(forecast.date, forecast.generatedAt || now, now, forecast.sourceSummary.sourceStart, forecast.morningSky || null, forecast.morningWind || null, forecast.nightSky || null, forecast.nightWind || null, forecast.minTemp || null, forecast.maxTemp || null, finalText, finalText, JSON.stringify(parts), parts.length, forecast.status, JSON.stringify(forecast.sourceSummary)).run();
  return database.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(forecast.date).first();
}
export function serializeSocialForecast(row) { if (!row) return null; return { date: row.forecast_date, generatedAt: row.generated_at, updatedAt: row.updated_at, source: row.source, status: row.status, originalText: row.original_text, finalText: row.final_text, parts: JSON.parse(row.parts_json || "[]"), partsCount: row.parts_count, minTemp: row.min_temp, maxTemp: row.max_temp, morningSummary: row.morning_summary, morningWind: row.morning_wind, nightSummary: row.night_summary, nightWind: row.night_wind, sourceSummary: JSON.parse(row.source_summary_json || "{}") }; }
