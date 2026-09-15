const TIME_ZONE = "America/Argentina/Buenos_Aires";
const BLOG_URL = "https://meteoituzaingo.blogspot.com/";
const MAX_POST_LENGTH = 270;
const POP_RELEVANT = 40;
const POP_WITH_PRECIPITATION = 20;
const GUST_RELEVANT_KMH = 35;
const WINDY_SPEED_KMH = 30;
const WINDY_GUST_KMH = 45;
const FEELS_LIKE_DIFFERENCE_C = 3;
const COLD_C = 10;
const VERY_COLD_C = 5;
const HOT_C = 30;
const VERY_HOT_C = 35;
// A sky description needs a validated symbol for most of the hours in its period.
const MIN_SYMBOL_COVERAGE = .6;
const CACHE_REFRESH_MARGIN_MS = 10 * 60 * 1000;
const inFlightForecasts = new Map();

const PERIODS = [
  { id: "dawn", label: "Madrugada", hours: [0, 1, 2, 3, 4, 5] },
  { id: "morning", label: "Mañana", hours: [6, 7, 8, 9, 10, 11] },
  { id: "afternoon", label: "Tarde", hours: [12, 13, 14, 15, 16, 17] },
  { id: "night", label: "Noche", hours: [18, 19, 20, 21, 22, 23] }
];

const VALIDATED_SYMBOLS = {
  3: { text: "Nubes y claros.", kind: "partly" },
  4: { text: "Parcialmente nuboso.", kind: "partly" },
  5: { text: "Cubierto.", kind: "covered" },
  12: { text: "Lluvia débil con cielo parcialmente nuboso.", kind: "light-rain" },
  13: { text: "Lluvia débil con cielo cubierto.", kind: "light-rain" }
};

const DIRECTIONS = { N: "Norte", NNE: "Norte", NE: "Noreste", ENE: "Noreste", E: "Este", ESE: "Este", SE: "Sudeste", SSE: "Sudeste", S: "Sur", SSO: "Sudoeste", SO: "Sudoeste", OSO: "Oeste", O: "Oeste", ONO: "Noroeste", NO: "Noroeste", NNO: "Noroeste", W: "Oeste", SW: "Sudoeste", NW: "Noroeste" };

export const PROHIBITED_SOCIAL_TERMS = ["chaparrones", "tormentas", "tormentas fuertes", "tormentas severas", "granizo", "posible granizo", "niebla", "neblina", "heladas", "probables heladas", "tiempo severo", "tiempo grave", "lluvia torrencial", "lluvia intensa", "temporal"];

function localParts(value) { return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }
export function argentinaDate(value = new Date()) { const parts = localParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function number(value) { return Number.isFinite(value) ? value : null; }
function timestamp(value) { return typeof value === "number" ? value : Number(value); }
function localHour(hour) { const time = timestamp(hour.end); return Number.isFinite(time) ? Number(localParts(new Date(time)).hour) : null; }
function values(hours, field) { return hours.map((hour) => number(hour[field])).filter((value) => value !== null); }
function min(list) { return list.length ? Math.min(...list) : null; }
function max(list) { return list.length ? Math.max(...list) : null; }
function roundedWind(value) { return Math.max(0, Math.round(value / 5) * 5); }
function formatNumber(value) { return Number.isFinite(value) ? value.toFixed(1).replace(".", ",").replace(",0", "") : null; }
function formatTemperature(value) { return Number.isFinite(value) ? `${Math.round(value)}°` : null; }

function dominantDirection(hours) {
  const directions = hours.map((hour) => DIRECTIONS[String(hour.wind_direction || "").toUpperCase()]).filter(Boolean);
  if (!directions.length) return null;
  const counts = directions.reduce((result, direction) => ({ ...result, [direction]: (result[direction] || 0) + 1 }), {});
  const predominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return predominant && predominant[1] / directions.length >= .55 ? predominant[0] : "variables";
}

function symbols(hours) { return hours.map((hour) => Number(hour.symbol)).filter(Number.isFinite); }
function unknownSymbols(hours) { return [...new Set(symbols(hours).filter((symbol) => !VALIDATED_SYMBOLS[symbol]))]; }
function dominantSymbol(hours) {
  const known = symbols(hours).filter((symbol) => VALIDATED_SYMBOLS[symbol]);
  if (!known.length) return null;
  const counts = known.reduce((result, symbol) => ({ ...result, [symbol]: (result[symbol] || 0) + 1 }), {});
  return Number(Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0][0]);
}
function hasCompleteCoverage(hours, expectedHours) {
  const received = hours.map(localHour).filter((hour) => Number.isInteger(hour));
  return expectedHours.every((hour) => received.filter((value) => value === hour).length === 1) && received.length === expectedHours.length;
}

function summarizePeriod(definition, dayHours) {
  const hours = dayHours.filter((hour) => definition.hours.includes(localHour(hour)));
  const complete = hasCompleteCoverage(hours, definition.hours);
  const temperatures = values(hours, "temperature"); const feelsLike = values(hours, "temperature_feels_like");
  const winds = values(hours, "wind_speed"); const gusts = values(hours, "wind_gust"); const pops = values(hours, "rain_probability"); const rains = values(hours, "rain");
  const rainTotalMm = complete && rains.length === definition.hours.length ? rains.reduce((total, value) => total + value, 0) : null;
  const periodSymbols = symbols(hours); const unknown = unknownSymbols(hours);
  const knownSymbolHours = periodSymbols.filter((symbol) => VALIDATED_SYMBOLS[symbol]).length;
  const unknownSymbolHours = Math.max(0, hours.length - knownSymbolHours);
  const symbolCoverage = hours.length ? knownSymbolHours / hours.length : 0;
  const periodDominantSymbol = symbolCoverage >= MIN_SYMBOL_COVERAGE ? dominantSymbol(hours) : null;
  const precipitationSymbol = periodSymbols.some((symbol) => [12, 13].includes(symbol));
  const popMax = max(pops); const popMin = min(pops); const gustMax = max(gusts); const windMax = max(winds);
  const hasPrecipitation = precipitationSymbol || (rainTotalMm !== null && rainTotalMm > 0);
  const showPop = Number.isFinite(popMax) && (popMax >= POP_RELEVANT || (popMax >= POP_WITH_PRECIPITATION && hasPrecipitation));
  const windy = (Number.isFinite(windMax) && windMax >= WINDY_SPEED_KMH) || (Number.isFinite(gustMax) && gustMax >= WINDY_GUST_KMH);
  const coldValue = min([min(temperatures), min(feelsLike)].filter(Number.isFinite)); const heatValue = max([max(temperatures), max(feelsLike)].filter(Number.isFinite));
  const feelsDifference = hours.reduce((difference, hour) => Math.max(difference, Number.isFinite(hour.temperature) && Number.isFinite(hour.temperature_feels_like) ? Math.abs(hour.temperature - hour.temperature_feels_like) : 0), 0);
  const relevant = hasPrecipitation || (Number.isFinite(popMax) && popMax >= POP_RELEVANT) || windy || (Number.isFinite(gustMax) && gustMax >= GUST_RELEVANT_KMH) || (Number.isFinite(coldValue) && coldValue <= COLD_C) || (Number.isFinite(heatValue) && heatValue >= HOT_C) || feelsDifference >= FEELS_LIKE_DIFFERENCE_C;
  return { ...definition, hours, hoursCount: hours.length, complete, temperatureMin: min(temperatures), temperatureMax: max(temperatures), feelsLikeMin: min(feelsLike), feelsLikeMax: max(feelsLike), symbols: periodSymbols, knownSymbolHours, unknownSymbolHours, symbolCoverage, dominantSymbol: periodDominantSymbol, sky: periodDominantSymbol ? VALIDATED_SYMBOLS[periodDominantSymbol].text : null, unknownSymbols: unknown, precipitationProbabilityMin: popMin, precipitationProbabilityMax: popMax, rainTotalMm, windMin: min(winds), windMax, dominantWindDirection: dominantDirection(hours), gustMax, windy, feelsDifference, coldValue, heatValue, relevant, hasPrecipitation, showPop };
}

function temperatureNote(period) {
  if (Number.isFinite(period.coldValue) && period.coldValue <= VERY_COLD_C) return "Muy frío.";
  if (Number.isFinite(period.coldValue) && period.coldValue <= COLD_C) return "Fresco.";
  if (Number.isFinite(period.heatValue) && period.heatValue >= VERY_HOT_C) return "Muy caluroso.";
  if (Number.isFinite(period.heatValue) && period.heatValue >= HOT_C) return "Caluroso.";
  return null;
}
function popNote(period) {
  if (!period.showPop) return null;
  const low = period.precipitationProbabilityMin; const high = period.precipitationProbabilityMax;
  if (!Number.isFinite(high)) return null;
  if (Number.isFinite(low) && low >= POP_RELEVANT && low !== high) return `Prob. de precipitación entre ${Math.round(low)} y ${Math.round(high)}%.`;
  return `Prob. de precipitación: hasta ${Math.round(high)}%.`;
}
function windNote(period) {
  if (!Number.isFinite(period.windMin) || !Number.isFinite(period.windMax)) return null;
  const low = roundedWind(period.windMin); const high = roundedWind(period.windMax); const direction = period.dominantWindDirection === "variables" ? "variables" : period.dominantWindDirection ? `del ${period.dominantWindDirection}` : "";
  const gust = Number.isFinite(period.gustMax) && (period.windy || period.gustMax >= GUST_RELEVANT_KMH) ? ` Ráfagas de hasta ${Math.round(period.gustMax)} km/h.` : "";
  const text = period.windy ? `Ventoso, con vientos ${direction} de ${Math.min(low, high)} a ${Math.max(low, high)} km/h.${gust}` : `Vientos ${direction} de ${Math.min(low, high)} a ${Math.max(low, high)} km/h.${gust}`;
  return text.replace("  ", " ");
}
function feelsLikeNote(period) { return period.feelsDifference >= FEELS_LIKE_DIFFERENCE_C && Number.isFinite(period.feelsLikeMin) ? `Sensación térmica mínima de ${formatTemperature(period.feelsLikeMin)}.` : null; }
function periodBlock(period) {
  const lines = [period.sky, popNote(period), period.rainTotalMm !== null && period.rainTotalMm > 0 ? `Precipitación prevista: ${formatNumber(period.rainTotalMm)} mm.` : null, windNote(period), temperatureNote(period), feelsLikeNote(period)].filter(Boolean);
  return lines.length ? `${period.label}:\n${lines.join("\n")}` : null;
}
function mergeStablePeriods(periods) {
  const result = [];
  for (const period of periods) {
    const previous = result.at(-1);
    const canMerge = previous && !previous.relevant && !period.relevant && previous.sky && previous.sky === period.sky && !previous.unknownSymbols.length && !period.unknownSymbols.length && previous.id === "morning" && period.id === "afternoon";
    if (!canMerge) { result.push(period); continue; }
    const definition = { id: "morning-afternoon", label: "Mañana y tarde", hours: previous.hours.concat(period.hours).map(localHour) };
    result[result.length - 1] = summarizePeriod(definition, previous.hours.concat(period.hours));
  }
  return result;
}
function splitPosts(blocks) { const posts = []; let current = ""; blocks.forEach((block) => { const candidate = current ? `${current}\n\n${block}` : block; if (candidate.length <= MAX_POST_LENGTH) current = candidate; else { if (current) posts.push(current); current = block; } }); if (current) posts.push(current); return posts.length > 1 ? posts.map((post, index) => `${index + 1}/${posts.length}\n${post}`) : posts; }
function dayTemperatures(hours, daily, date) { const dailyItem = (daily.days || []).find((item) => argentinaDate(new Date(timestamp(item.start))) === date); if (dailyItem && number(dailyItem.temperature_min) !== null && number(dailyItem.temperature_max) !== null) return { min: dailyItem.temperature_min, max: dailyItem.temperature_max }; const hourlyTemperatures = values(hours, "temperature"); return hourlyTemperatures.length ? { min: Math.min(...hourlyTemperatures), max: Math.max(...hourlyTemperatures) } : null; }
function assertAllowedText(text) { const normalized = text.toLocaleLowerCase("es-AR"); const forbidden = PROHIBITED_SOCIAL_TERMS.find((term) => normalized.includes(term)); if (forbidden) throw new Error(`Texto social contiene un término no validado: ${forbidden}`); }

export function buildSocialForecastFromData(hourly, daily, date = argentinaDate()) {
  const hours = (hourly.hours || []).filter((hour) => argentinaDate(new Date(timestamp(hour.end))) === date && Number.isFinite(localHour(hour)));
  const temperatures = dayTemperatures(hours, daily, date); const periods = PERIODS.map((definition) => summarizePeriod(definition, hours)); const unknown = [...new Set(periods.flatMap((period) => period.unknownSymbols))];
  if (!hours.length || !temperatures) return { date, status: "incomplete", parts: [], originalText: "", sourceSummary: { hourlyHours: hours.length, unknownSymbols: unknown, periods } };
  const renderedPeriods = mergeStablePeriods(periods.filter((period) => period.hoursCount > 0)).map(periodBlock).filter(Boolean);
  const blocks = ["Pronóstico para hoy:", ...renderedPeriods, `Temp.: mín. ${formatTemperature(temperatures.min)} / máx. ${formatTemperature(temperatures.max)}`, `Blog: ${BLOG_URL}`];
  const originalText = blocks.join("\n\n"); assertAllowedText(originalText);
  return { date, status: "generated", generatedAt: new Date().toISOString(), originalText, parts: splitPosts(blocks), minTemp: temperatures.min, maxTemp: temperatures.max, sourceSummary: { generatorVersion: "1.10", hourlyHours: hours.length, sourceStart: hourly.start || null, relevant: periods.some((period) => period.relevant) ? "RELEVANT" : "NORMAL", symbols: hours.map((hour) => hour.symbol), unknownSymbols: unknown, periods } };
}

async function fetchAndStoreForecast(database, env, type) {
  if (!env.METEORED_API_KEY || !env.METEORED_LOCATION_HASH) throw new Error("Pronóstico Meteored no configurado");
  const response = await fetch(`https://api.meteored.com/api/forecast/v1/${type}/${env.METEORED_LOCATION_HASH}`, { headers: { "X-API-Key": env.METEORED_API_KEY, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Meteored respondió ${response.status}`);
  const body = await response.json(); if (!body.ok || !body.data || !Number.isFinite(body.expiracion)) throw new Error("Respuesta Meteored inválida");
  await database.prepare("INSERT INTO social_forecast_cache (source_type, expires_at, payload_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(source_type) DO UPDATE SET expires_at=excluded.expires_at, payload_json=excluded.payload_json, updated_at=excluded.updated_at").bind(type, body.expiracion, JSON.stringify(body.data), new Date().toISOString()).run();
  return body.data;
}

async function cachedForecast(database, env, type, { refreshBeforeMs = 0, now = Date.now() } = {}) {
  const cached = await database.prepare("SELECT payload_json, expires_at FROM social_forecast_cache WHERE source_type = ? LIMIT 1").bind(type).first();
  if (cached && Number.isFinite(cached.expires_at) && cached.expires_at > now + refreshBeforeMs) return JSON.parse(cached.payload_json);
  if (inFlightForecasts.has(type)) return inFlightForecasts.get(type);
  const refresh = fetchAndStoreForecast(database, env, type).finally(() => inFlightForecasts.delete(type));
  inFlightForecasts.set(type, refresh);
  return refresh;
}

/** Runs from the existing capture schedule; it is intentionally isolated from EMA capture. */
export async function maintainForecastCache(database, env, now = Date.now()) {
  const results = await Promise.allSettled(["hourly", "daily"].map((type) => cachedForecast(database, env, type, { refreshBeforeMs: CACHE_REFRESH_MARGIN_MS, now })));
  return results.map((result, index) => ({ type: ["hourly", "daily"][index], status: result.status }));
}

export async function publicForecast(database, env, type) { if (!["hourly", "daily"].includes(type)) throw new Error("Tipo de pronóstico inválido"); return cachedForecast(database, env, type); }
export async function buildSocialForecast(database, env, date = argentinaDate()) {
  const [hourly, daily] = await Promise.all([cachedForecast(database, env, "hourly"), cachedForecast(database, env, "daily")]);
  const forecast = buildSocialForecastFromData(hourly, daily, date);
  forecast.sourceSummary.unknownSymbols.forEach((symbol) => console.warn(JSON.stringify({ event: "unknown_meteored_symbol", symbol, localDate: date })));
  return forecast;
}
export async function saveSocialForecast(database, forecast, force = false) {
  const existing = await database.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(forecast.date).first();
  if (existing && existing.status === "edited" && !force) return existing;
  const now = new Date().toISOString(); const finalText = forecast.originalText || ""; const parts = forecast.parts || []; const summary = forecast.sourceSummary || {};
  await database.prepare(`INSERT INTO social_forecasts (forecast_date, generated_at, updated_at, source, source_timestamp, generator_version, morning_summary, morning_wind, night_summary, night_wind, min_temp, max_temp, original_text, final_text, parts_json, parts_count, status, source_summary_json) VALUES (?, ?, ?, 'Meteored', ?, '1.10', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(forecast_date) DO UPDATE SET generated_at=excluded.generated_at, updated_at=excluded.updated_at, source_timestamp=excluded.source_timestamp, generator_version=excluded.generator_version, morning_summary=excluded.morning_summary, morning_wind=excluded.morning_wind, night_summary=excluded.night_summary, night_wind=excluded.night_wind, min_temp=excluded.min_temp, max_temp=excluded.max_temp, original_text=excluded.original_text, final_text=excluded.final_text, parts_json=excluded.parts_json, parts_count=excluded.parts_count, status=excluded.status, source_summary_json=excluded.source_summary_json`).bind(forecast.date, forecast.generatedAt || now, now, summary.sourceStart || null, null, null, null, null, forecast.minTemp || null, forecast.maxTemp || null, finalText, finalText, JSON.stringify(parts), parts.length, forecast.status, JSON.stringify(summary)).run();
  return database.prepare("SELECT * FROM social_forecasts WHERE forecast_date = ?").bind(forecast.date).first();
}
export function serializeSocialForecast(row) { if (!row) return null; return { date: row.forecast_date, generatedAt: row.generated_at, updatedAt: row.updated_at, source: row.source, status: row.status, originalText: row.original_text, finalText: row.final_text, parts: JSON.parse(row.parts_json || "[]"), partsCount: row.parts_count, minTemp: row.min_temp, maxTemp: row.max_temp, morningSummary: row.morning_summary, morningWind: row.morning_wind, nightSummary: row.night_summary, nightWind: row.night_wind, sourceSummary: JSON.parse(row.source_summary_json || "{}") }; }
