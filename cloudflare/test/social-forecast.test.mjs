import assert from "node:assert/strict";
import { buildSocialForecastFromData, PROHIBITED_SOCIAL_TERMS } from "../src/social-forecast.js";

const DATE = "2026-09-09";
const at = (hour, date = DATE) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00-03:00`);
const HOUR_MS = 60 * 60 * 1000;
// Real Meteored-shaped slot: the item labels the end of its one-hour interval.
function forecastHour(hour, overrides = {}, date = DATE) { const start = at(hour, date); return { end: start + HOUR_MS, symbol: 3, temperature: 18, temperature_feels_like: 18, rain_probability: 0, rain: 0, wind_speed: 10, wind_gust: 15, wind_direction: "E", ...overrides }; }
const endAt = (hour, date = DATE) => at(hour, date) + HOUR_MS;
function payload(hours) { return { hourly: { start: at(0), hours }, daily: { days: [{ start: at(0), temperature_min: 10, temperature_max: 22 }] } }; }
function fullDay(overrides = {}) { return Array.from({ length: 24 }, (_, hour) => forecastHour(hour, overrides[hour] || {})); }
function build(hours) { const { hourly, daily } = payload(hours); return buildSocialForecastFromData(hourly, daily, DATE); }
function assertSafe(text) { PROHIBITED_SOCIAL_TERMS.forEach((term) => assert.equal(text.toLocaleLowerCase("es-AR").includes(term), false, `No debe incluir ${term}`)); }

{
  const { daily } = payload([]); const forecast = buildSocialForecastFromData({ hours: [] }, daily, DATE);
  assert.equal(forecast.status, "partial"); assert.equal(forecast.sourceSummary.mode, "daily_general"); assert.ok(forecast.originalText.includes("Pronóstico general para hoy:")); assert.equal(/Madrugada|Mañana|Tarde|Noche/.test(forecast.originalText), false);
}
{
  const forecast = build(fullDay().filter((hour) => hour.end !== endAt(23)));
  assert.equal(forecast.status, "partial"); assert.equal(forecast.sourceSummary.periods.find((period) => period.id === "night").complete, false); assert.equal(forecast.originalText.includes("Noche:"), false);
}

for (const [symbol, expected] of [[3, "Nubes y claros."], [4, "Parcialmente nuboso."], [5, "Cubierto."], [12, "Lluvia débil con cielo parcialmente nuboso."], [13, "Lluvia débil con cielo cubierto."]]) {
  const forecast = build(fullDay(Object.fromEntries(Array.from({ length: 24 }, (_, hour) => [hour, { symbol, rain: [12, 13].includes(symbol) ? 0.1 : 0, rain_probability: [12, 13].includes(symbol) ? 30 : 0 }]))));
  assert.ok(forecast.originalText.includes(expected), `symbol ${symbol}`); assertSafe(forecast.originalText);
}

{
  const forecast = build(fullDay({ 12: { symbol: 99, rain_probability: 70, rain: 0.4 } }));
  assert.equal(forecast.status, "complete"); assert.ok(forecast.sourceSummary.unknownSymbols.includes(99)); assertSafe(forecast.originalText);
}
{
  const forecast = build([1, 2, 3, 4, 5].map((hour, index) => forecastHour(hour, { symbol: index === 4 ? 3 : 1 })));
  const dawn = forecast.sourceSummary.periods.find((period) => period.id === "dawn");
  assert.equal(forecast.status, "partial"); assert.equal(dawn.knownSymbolHours, 1); assert.equal(dawn.unknownSymbolHours, 4); assert.equal(dawn.symbolCoverage, .2); assert.equal(dawn.sky, null); assert.equal(forecast.originalText.includes("Nubes y claros."), false); assert.ok(forecast.originalText.includes("Pronóstico general para hoy:"));
}
{
  const forecast = build(Array.from({ length: 6 }, (_, index) => forecastHour(6 + index, { symbol: index === 2 ? 4 : 99 })));
  const morning = forecast.sourceSummary.periods.find((period) => period.id === "morning");
  assert.equal(morning.symbolCoverage, 1 / 6); assert.equal(morning.sky, null); assert.equal(forecast.originalText.includes("Parcialmente nuboso."), false);
}
{
  const forecast = build(Array.from({ length: 6 }, (_, index) => forecastHour(6 + index, { symbol: index < 4 ? 4 : 99 })));
  const morning = forecast.sourceSummary.periods.find((period) => period.id === "morning");
  assert.equal(morning.knownSymbolHours, 4); assert.equal(morning.unknownSymbolHours, 2); assert.equal(morning.symbolCoverage, 4 / 6); assert.equal(morning.sky, "Parcialmente nuboso."); assert.ok(forecast.originalText.includes("Parcialmente nuboso."));
}
{
  const forecast = build(fullDay({ 6: { rain_probability: 60 } }));
  assert.ok(forecast.originalText.includes("Prob. de precipitación: hasta 60%."));
}
{
  const forecast = build(fullDay({ 6: { symbol: 12, rain: 0.2, rain_probability: 30 }, 7: { symbol: 12, rain: 0.6, rain_probability: 30 }, 8: { symbol: 12, rain: 0.2, rain_probability: 30 } }));
  const morning = forecast.sourceSummary.periods.find((period) => period.id === "morning");
  assert.equal(morning.rainTotalMm, 1); assert.ok(forecast.originalText.includes("Precipitación prevista: 1 mm."));
}
{
  const hours = fullDay({ 6: { symbol: 12, rain: 0.2, rain_probability: 30 }, 7: { symbol: 12, rain: 0.6, rain_probability: 30 }, 8: { symbol: 12, rain: 0.2, rain_probability: 30 } }).filter((hour) => hour.end !== endAt(8));
  const forecast = build(hours); const morning = forecast.sourceSummary.periods.find((period) => period.id === "morning");
  assert.equal(morning.complete, false); assert.equal(morning.rainTotalMm, null); assert.equal(forecast.originalText.includes("Precipitación prevista: 1 mm."), false);
}

// The real midnight horizon is [00:00, 24:00): all 24 slots must be assigned
// using interval start, including 23:00 -> 00:00 of the next local date.
{
  const forecast = build(fullDay());
  assert.equal(forecast.status, "complete");
  for (const id of ["dawn", "morning", "afternoon", "night"]) {
    const period = forecast.sourceSummary.periods.find((item) => item.id === id);
    assert.equal(period.hoursCount, 6, `${id} must retain six intervals`); assert.equal(period.complete, true, `${id} must be complete`);
  }
  assert.equal(forecast.sourceSummary.hourlyHours, 24);
}
{
  const forecast = build(fullDay().filter((hour) => hour.end !== endAt(3)));
  assert.equal(forecast.status, "partial"); assert.equal(forecast.sourceSummary.periods.find((period) => period.id === "dawn").hoursCount, 5);
  assert.equal(forecast.sourceSummary.periods.find((period) => period.id === "dawn").complete, false);
}
{
  const forecast = build(fullDay().filter((hour) => hour.end !== endAt(23)));
  assert.equal(forecast.status, "partial"); assert.equal(forecast.sourceSummary.periods.find((period) => period.id === "night").hoursCount, 5);
}
{
  const duplicated = [...fullDay(), forecastHour(3)]; const forecast = build(duplicated);
  assert.equal(forecast.status, "partial"); assert.equal(forecast.sourceSummary.periods.find((period) => period.id === "dawn").complete, false, "A duplicate cannot complete coverage");
}
{
  const forecast = build([...fullDay(), { end: "invalid" }]);
  assert.equal(forecast.status, "complete", "Invalid timestamps are ignored safely");
}
{
  // Explicit, valid starts take priority over end-derived starts.
  const hours = fullDay().map((hour) => ({ ...hour, start: hour.end - HOUR_MS })); const forecast = build(hours);
  assert.equal(forecast.status, "complete");
}
{
  const forecast = build(fullDay({ 12: { wind_gust: 36 }, 13: { wind_speed: 30, wind_gust: 45 } }));
  assert.ok(forecast.originalText.includes("Ventoso,")); assert.ok(forecast.originalText.includes("Ráfagas de hasta 45 km/h."));
}
{
  const forecast = build(fullDay({ 6: { temperature: 8, temperature_feels_like: 4 } }));
  assert.ok(forecast.originalText.includes("Muy frío.")); assert.ok(forecast.originalText.includes("Sensación térmica mínima de 4°."));
}
{
  const forecast = build(fullDay());
  assert.equal(forecast.sourceSummary.relevant, "NORMAL"); assert.ok(forecast.originalText.includes("Mañana y tarde:"));
}
{
  const forecast = build(fullDay(Object.fromEntries(Array.from({ length: 6 }, (_, index) => [12 + index, { symbol: 5 }]))));
  assert.ok(forecast.originalText.includes("Mañana:")); assert.ok(forecast.originalText.includes("Tarde:")); assert.equal(forecast.originalText.includes("Mañana y tarde:"), false);
}
{
  const hours = [forecastHour(23, {}, "2026-09-08"), ...fullDay()]; const forecast = build(hours);
  assert.equal(forecast.sourceSummary.hourlyHours, 24); assert.equal(forecast.date, DATE);
}

console.log("social-forecast tests: OK");
