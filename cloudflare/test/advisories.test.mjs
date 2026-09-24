import assert from "node:assert/strict";
import { advisoriesResponse, evaluateAdvisories, evaluateHighTemperature, evaluateLowTemperature, evaluateThunderstorm, evaluateWind, publicAdvisoryStatus, selectLowTemperatureTargetPeriod } from "../src/advisories.js";

const at = (date, hour) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00-03:00`);
const atLocal = (date, hour, minute = 0) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
const NOW = atLocal("2026-09-15", 8, 0);
const TARGET = "2026-09-15";
const TOMORROW = "2026-09-16";
const daily = (minimum = 5, date = TARGET) => ({ days: [{ start: at(date, 0), temperature_min: minimum, temperature_max: 20 }] });
const dawn = (overrides = {}) => ({ hours: [0, 1, 2, 3, 4, 5].map((hour) => ({ end: at(TARGET, hour), temperature: 5, temperature_feels_like: 5, ...(overrides[hour] || {}) })) });
const evaluate = (extra = {}) => evaluateLowTemperature({ daily: daily(), hourly: dawn(), now: NOW, ...extra });
const emaOk = { data_freshness: "FRESH", capture_health: "OK" };
const observations = [{ observed_at: new Date(NOW - 600000).toISOString(), temperature: 2, feels_like: 2 }, { observed_at: new Date(NOW - 1200000).toISOString(), temperature: 2, feels_like: 2 }];

// Daily minimum rules and independent source states.
assert.equal(evaluate({ daily: daily(5) }).status, "no_advisory");
assert.equal(evaluate({ daily: daily(4) }).advisories[0].category, "information");
assert.equal(evaluate({ daily: daily(2) }).advisories[0].category, "attention");
assert.equal(evaluate({ daily: daily(1) }).advisories[0].category, "attention");
const dailyInformation = evaluate({ daily: daily(4) }).advisories[0];
assert.equal(dailyInformation.temporalPrecision, "daily");
assert.equal(dailyInformation.targetLocalDate, TARGET);
assert.deepEqual(dailyInformation.evidencePeriods, []);
assert.equal(dailyInformation.displayValidity, "dynamic");
assert.equal(dailyInformation.evaluationPeriod.startsAt, dailyInformation.startsAt);
assert.equal(evaluate({ daily: { days: [{ start: at(TARGET, 0), temperature_min: null }] } }).sourceStatus.forecastDaily, "insufficient");
assert.equal(evaluate({ daily: { days: [] } }).sourceStatus.forecastDaily, "insufficient");
assert.equal(evaluate({ dailyAvailable: false }).sourceStatus.forecastDaily, "unavailable");

// Hourly threshold, completeness, duplicates, invalid timestamps and gaps.
assert.equal(evaluate({ hourly: dawn({ 1: { temperature_feels_like: 0 } }) }).status, "no_advisory");
assert.equal(evaluate({ hourly: dawn({ 1: { temperature_feels_like: 0 }, 2: { temperature_feels_like: 0 } }) }).advisories[0].category, "attention");
const hourlyOnly = evaluate({ daily: daily(5), hourly: dawn({ 1: { temperature_feels_like: 0 }, 2: { temperature_feels_like: 0 } }) }).advisories[0];
assert.equal(hourlyOnly.temporalPrecision, "hourly");
assert.deepEqual(hourlyOnly.evidencePeriods.map((item) => item.dayParts), [["dawn"]]);
assert.equal(hourlyOnly.values.forecastMinimumFeelsLikeC, 0);
assert.deepEqual(hourlyOnly.values.triggerRun && { minFeelsLike: hourlyOnly.values.triggerRun.minFeelsLike, temperatureAtMinFeelsLike: hourlyOnly.values.triggerRun.temperatureAtMinFeelsLike, slotCount: hourlyOnly.values.triggerRun.slotCount, dayParts: hourlyOnly.values.triggerRun.dayParts }, { minFeelsLike: 0, temperatureAtMinFeelsLike: 5, slotCount: 2, dayParts: ["dawn"] });
assert.equal(evaluate({ hourly: dawn({ 1: { temperature_feels_like: 0 }, 3: { temperature_feels_like: 0 } }) }).status, "no_advisory");
assert.equal(evaluate({ hourly: dawn({ 1: { temperature: 11, temperature_feels_like: 0 }, 2: { temperature_feels_like: 0 } }) }).status, "no_advisory");
assert.equal(evaluate({ hourly: { hours: dawn().hours.filter((hour) => hour.end !== at(TARGET, 5)) } }).sourceStatus.forecastHourly, "insufficient");
assert.equal(evaluate({ hourly: { hours: [...dawn().hours, { ...dawn().hours[1] }] } }).sourceStatus.forecastHourly, "insufficient");
assert.equal(evaluate({ hourly: { hours: [{ end: "invalid" }] } }).sourceStatus.forecastHourly, "insufficient");
assert.equal(evaluate({ hourly: { hours: dawn().hours.map((hour, index) => index === 3 ? { ...hour, end: hour.end + 3600000 } : hour) } }).sourceStatus.forecastHourly, "insufficient");
assert.equal(evaluate({ hourlyAvailable: false }).sourceStatus.forecastHourly, "unavailable");

// Combination contract: advisory wins; absence is never inferred from missing coverage.
assert.equal(evaluate({ daily: daily(2), hourlyAvailable: false }).status, "advisory");
assert.equal(evaluate({ daily: daily(4), hourly: { hours: [] } }).status, "advisory");
assert.equal(evaluate({ daily: daily(4), hourly: { hours: [] } }).advisories[0].values.forecastMinimumFeelsLikeC, null);
assert.equal(evaluate({ daily: daily(5), hourly: dawn() }).status, "no_advisory");
assert.equal(evaluate({ daily: daily(5), hourly: { hours: [] } }).status, "partial");
assert.equal(evaluate({ dailyAvailable: false, hourly: dawn({ 1: { temperature_feels_like: 0 }, 2: { temperature_feels_like: 0 } }) }).status, "advisory");
assert.equal(evaluate({ dailyAvailable: false, hourly: dawn() }).status, "partial");
assert.equal(evaluate({ dailyAvailable: false, hourlyAvailable: false }).status, "partial");
assert.equal(evaluate({ daily: daily(2), hourly: dawn(), ema: emaOk, observationRows: observations }).advisories[0].basis.includes("observation_temperature"), true);
const combined = evaluate({ daily: daily(2), hourly: dawn({ 1: { temperature_feels_like: 0 }, 2: { temperature_feels_like: 0 } }) }).advisories[0];
assert.equal(combined.temporalPrecision, "daily");
assert.deepEqual(combined.supportingEvidencePeriods.map((item) => item.dayParts), [["dawn"]]);
assert.equal(combined.values.triggerRun.slotCount, 2);

// The public status is a reusable projection; engine states never change.
assert.equal(publicAdvisoryStatus("advisory"), "active");
assert.equal(publicAdvisoryStatus("no_advisory"), "no_advisory");
assert.equal(publicAdvisoryStatus("partial"), "no_advisory");
assert.equal(publicAdvisoryStatus("insufficient_data"), "no_advisory");
assert.equal(publicAdvisoryStatus("unavailable"), "unavailable");
assert.equal(publicAdvisoryStatus("error"), "unavailable");
assert.equal(publicAdvisoryStatus("partial", true), "unavailable");
const lowPartialPublic = evaluateAdvisories({ evaluators: [() => evaluate({ daily: daily(5), hourly: { hours: [] } })] });
assert.equal(lowPartialPublic.evaluations[0].status, "partial");
assert.equal(lowPartialPublic.families[0].evaluationStatus, "partial");
assert.equal(lowPartialPublic.families[0].publicStatus, "no_advisory");

// Target policy is ART based, crosses dates/month/year, and has no server timezone dependency.
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 0, 30)).targetLocalDate, "2026-09-15");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 6)).targetLocalDate, "2026-09-15");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 8)).targetLocalDate, "2026-09-15");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 12)).targetLocalDate, "2026-09-16");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 18)).targetLocalDate, "2026-09-16");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 21)).targetLocalDate, "2026-09-16");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-09-15", 23, 59)).targetLocalDate, "2026-09-16");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-12-31", 23, 30)).targetLocalDate, "2027-01-01");
assert.equal(selectLowTemperatureTargetPeriod(atLocal("2026-01-31", 23, 30)).targetLocalDate, "2026-02-01");

// HIGH_TEMP remains daily-autonomous. Hourly feels-like can only add a fully
// covered descriptive dayPart after the daily threshold already triggered.
const hotDaily = (todayMaximum = 30, tomorrowMaximum = 30) => ({ days: [
  { start: at(TARGET, 0), temperature_max: todayMaximum }, { start: at(TOMORROW, 0), temperature_max: tomorrowMaximum }
] });
const hotHours = (date = TARGET, overrides = {}) => ({ hours: Array.from({ length: 24 }, (_, hour) => ({ end: at(date, hour) + 3600000, start: at(date, hour), temperature: 30, temperature_feels_like: 30, humidity: 50, ...(overrides[hour] || {}) })) });
const high = (extra = {}) => evaluateHighTemperature({ daily: hotDaily(), hourly: hotHours(), dailyUpdatedAt: new Date(NOW).toISOString(), hourlyUpdatedAt: new Date(NOW).toISOString(), now: NOW, ...extra });
for (const [maximum, status, category] of [[33.9, "no_advisory", null], [34, "advisory", "information"], [35.9, "advisory", "information"], [36, "advisory", "attention"], [40, "advisory", "attention"]]) {
  const result = high({ daily: hotDaily(maximum) }); assert.equal(result.status, status, `daily maximum ${maximum}`); if (category) assert.equal(result.advisories[0].category, category);
}
const multiHigh = high({ daily: hotDaily(34, 36) }).advisories[0];
assert.equal(multiHigh.category, "attention"); assert.deepEqual(multiHigh.targetLocalDates, [TARGET, TOMORROW]);
assert.equal(high({ daily: hotDaily(36), hourly: null, hourlyUpdatedAt: null }).status, "advisory");
assert.equal(high({ daily: hotDaily(33), hourly: hotHours(TARGET, { 13: { temperature: 32, temperature_feels_like: 38, humidity: 60 } }) }).status, "no_advisory");
assert.equal(high({ daily: hotDaily(36), hourly: hotHours(TARGET, { 13: { temperature_feels_like: 32 } }) }).advisories[0].values.forecastDays[0].feelsLike, null);
assert.equal(high({ daily: hotDaily(36), hourly: hotHours(TARGET, { 13: { temperature: 26, temperature_feels_like: 32, humidity: 60 } }) }).advisories[0].values.forecastDays[0].feelsLike, null);
assert.equal(high({ daily: hotDaily(36), hourly: hotHours(TARGET, { 13: { temperature: 30, temperature_feels_like: 34, humidity: 40 } }) }).advisories[0].values.forecastDays[0].feelsLike, null);
assert.equal(high({ daily: hotDaily(36), hourly: hotHours(TARGET, { 13: { temperature: 30, temperature_feels_like: 30, humidity: 60 } }) }).advisories[0].values.forecastDays[0].feelsLike, null);
const hotEvidence = high({ daily: hotDaily(36), hourly: hotHours(TARGET, { 13: { temperature: 30, temperature_feels_like: 33, humidity: 60 } }) }).advisories[0].values.forecastDays[0].feelsLike;
assert.equal(hotEvidence.feelsLikeC, 33); assert.equal(hotEvidence.dayPart, "afternoon");
const incompleteHot = hotHours(); incompleteHot.hours = incompleteHot.hours.filter((hour) => hour.start !== at(TARGET, 14));
assert.equal(high({ daily: hotDaily(36), hourly: incompleteHot }).advisories[0].values.forecastDays[0].feelsLike, null);

// WIND: one gust is enough; sustained speed needs two unique, continuous slots.
const windHour = (date, hour, fields = {}) => ({ start: at(date, hour), end: at(date, hour) + 3600000, wind_speed: 10, wind_gust: 10, wind_direction: "NE", ...fields });
const wind = (hours, extra = {}) => evaluateWind({ hourly: { hours }, hourlyUpdatedAt: new Date(NOW).toISOString(), now: NOW, ...extra });
const futureWindHours = (fields = {}) => [windHour(TARGET, 10, fields[10]), windHour(TARGET, 11, fields[11]), windHour(TARGET, 12, fields[12])];
assert.equal(wind(futureWindHours({ 10: { wind_speed: 29.9 }, 11: { wind_speed: 29.9 } })).status, "no_advisory");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 30 } })).status, "no_advisory");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 30 }, 11: { wind_speed: 30 } })).advisories[0].category, "information");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 44.9 }, 11: { wind_speed: 44.9 } })).advisories[0].category, "information");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 45 } })).status, "no_advisory");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 45 }, 11: { wind_speed: 45 } })).advisories[0].category, "attention");
assert.equal(wind(futureWindHours({ 10: { wind_gust: 44.9 } })).status, "no_advisory");
assert.equal(wind(futureWindHours({ 10: { wind_gust: 45 } })).advisories[0].category, "information");
assert.equal(wind(futureWindHours({ 10: { wind_gust: 59.9 } })).advisories[0].category, "information");
assert.equal(wind(futureWindHours({ 10: { wind_gust: 60 } })).advisories[0].category, "attention");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 20, wind_gust: 60 } })).advisories[0].category, "attention");
assert.equal(wind(futureWindHours({ 10: { wind_speed: 45, wind_gust: 45 }, 11: { wind_speed: 45 } })).advisories[0].category, "attention");
assert.equal(wind([windHour(TARGET, 10, { wind_speed: 30 }), windHour(TARGET, 12, { wind_speed: 30 })]).status, "no_advisory");
assert.equal(wind([windHour(TARGET, 10, { wind_speed: 30 }), windHour(TARGET, 10, { wind_speed: 30 })]).status, "insufficient_data");
assert.equal(wind([windHour(TARGET, 23, { wind_speed: 30 }), windHour(TOMORROW, 0, { wind_speed: 30 })]).advisories[0].category, "information");
assert.equal(wind(futureWindHours({ 10: { wind_gust: 60, wind_direction: null } })).advisories[0].values.windDirection, null);
assert.equal(evaluateWind({ hourly: null, hourlyUpdatedAt: null, now: NOW }).status, "insufficient_data");

// Thunderstorm is daily-only for activation. Freshness is based on the local
// capture time, never on Meteored's short upstream expiration metadata.
const stormDaily = (todaySymbol = 3, tomorrowSymbol = 3, extra = {}) => ({ days: [
  { start: at(TARGET, 0), symbol: todaySymbol, ...extra },
  { start: at(TOMORROW, 0), symbol: tomorrowSymbol, ...extra }
] });
const stormHour = (date, hour, symbol) => ({ end: at(date, hour), symbol });
const storm = (extra = {}) => evaluateThunderstorm({ daily: stormDaily(), dailyUpdatedAt: new Date(NOW).toISOString(), hourly: { hours: [] }, hourlyUpdatedAt: new Date(NOW).toISOString(), now: NOW, ...extra });
for (const symbol of [34, 35]) assert.equal(storm({ daily: stormDaily(symbol) }).status, "advisory", `symbol ${symbol}`);
for (const symbol of [3, 12, 13, 28, 29, 10, 11, 38, 39]) assert.equal(storm({ daily: stormDaily(symbol) }).status, "no_advisory", `reserved/non-trigger symbol ${symbol}`);
assert.equal(storm({ daily: stormDaily(3, 3, { rain: 80 }) }).status, "no_advisory");
assert.equal(storm({ daily: stormDaily(3, 3, { rain_probability: 100 }) }).status, "no_advisory");
assert.equal(storm({ daily: stormDaily(3, 3, { wind_gust: 120 }) }).status, "no_advisory");
assert.equal(storm({ daily: stormDaily(34), dailyUpdatedAt: new Date(NOW - 8 * 3600000).toISOString() }).status, "advisory");
assert.equal(storm({ daily: stormDaily(34), dailyUpdatedAt: new Date(NOW - 8 * 3600000 - 1).toISOString() }).status, "insufficient_data");
assert.equal(storm({ daily: stormDaily(3, 34) }).status, "advisory");
assert.equal(storm({ daily: stormDaily(3, 3), hourlyAvailable: false }).status, "no_advisory");
assert.equal(storm({ daily: { days: [{ start: at(TARGET, 0), symbol: 3 }, { start: at(TOMORROW, 0), symbol: 3 }, { start: at("2026-09-17", 0), symbol: 34 }] } }).status, "no_advisory");
assert.equal(storm({ daily: { days: [{ start: at("2026-09-14", 0), symbol: 34 }, { start: at(TARGET, 0), symbol: 3 }, { start: at(TOMORROW, 0), symbol: 3 }] } }).status, "no_advisory");
assert.equal(storm({ daily: { days: [] } }).status, "insufficient_data");
assert.equal(storm({ daily: { days: [{ start: at(TARGET, 0), symbol: 34 }, { start: at(TOMORROW, 0), symbol: "invalid" }] } }).status, "insufficient_data");
assert.equal(storm({ daily: stormDaily(34), dailyUpdatedAt: null }).status, "insufficient_data");
const dailyOnlyStorm = storm({ daily: stormDaily(34, 3, { rain: 6.1, rain_probability: 80 }), hourly: null, hourlyUpdatedAt: null }).advisories[0];
assert.equal(dailyOnlyStorm.temporalPrecision, "daily"); assert.deepEqual(dailyOnlyStorm.evidencePeriods, [{ date: TARGET, dayParts: [] }]);
for (const [hour, expected] of [[2, "dawn"], [7, "morning"], [13, "afternoon"], [20, "night"]]) {
  const advisory = storm({ daily: stormDaily(34), hourly: { hours: [stormHour(TARGET, hour, 34)] } }).advisories[0];
  assert.deepEqual(advisory.evidencePeriods[0].dayParts, [expected]);
}
const multiParts = storm({ daily: stormDaily(34), hourly: { hours: [stormHour(TARGET, 13, 34), stormHour(TARGET, 20, 35)] } }).advisories[0];
assert.deepEqual(multiParts.evidencePeriods[0].dayParts, ["afternoon", "night"]);
const midnightStorm = storm({ daily: stormDaily(3, 34), hourly: { hours: [stormHour(TOMORROW, 0, 35)] } }).advisories[0];
assert.deepEqual(midnightStorm.evidencePeriods[0].dayParts, ["dawn"]);
const twoDaysStorm = storm({ daily: stormDaily(34, 35) }).advisories[0];
assert.equal(twoDaysStorm.targetLocalDates.length, 2); assert.equal(twoDaysStorm.id, "thunderstorm:local");

// Engine aggregation deliberately supports future families without limiting the output array.
const fakeInformation = () => ({ type: "future_information", status: "advisory", advisories: [{ id: "a", category: "information" }] });
const fakeAttention = () => ({ type: "future_attention", status: "advisory", advisories: [{ id: "b", category: "attention" }] });
assert.equal(evaluateAdvisories({ evaluators: [] }).advisories.length, 0);
assert.equal(evaluateAdvisories({ evaluators: [fakeInformation] }).advisories.length, 1);
const aggregated = evaluateAdvisories({ evaluators: [fakeInformation, fakeAttention] });
assert.equal(aggregated.advisories.length, 2); assert.equal(aggregated.advisories[0].id, "b");

function database({ dailyRow = null, hourlyRow = null, ema = null, rows = [] } = {}) {
  return { prepare(sql) { return { first: async () => sql.includes("source_type = 'daily'") ? dailyRow : sql.includes("source_type = 'hourly'") ? hourlyRow : ema, all: async () => ({ results: rows }) }; } };
}
const request = new Request("https://worker.example/api/advisories", { headers: { Origin: "https://gerchop.github.io" } });
const dailyRow = { payload_json: JSON.stringify(daily(2)), updated_at: "2026-09-15T00:00:00.000Z", expires_at: NOW + 60000 };
const hourlyRow = { payload_json: JSON.stringify(dawn()), updated_at: "2026-09-15T00:00:00.000Z", expires_at: NOW + 60000 };
const response = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database({ dailyRow, hourlyRow, ema: emaOk, rows: observations }) }, NOW);
const body = await response.json();
assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://gerchop.github.io"); assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
assert.equal(body.sourceStatus.forecastDaily, "available"); assert.equal(body.evaluation.status, "advisory"); assert.equal(body.advisories[0].category, "attention");
assert.deepEqual(body.families.map((family) => family.id), ["low_temperature", "high_temperature", "thunderstorm", "wind"]);
assert.equal(body.families[0].evaluationStatus, "advisory"); assert.equal(body.families[0].publicStatus, "active");
assert.equal(body.families[1].evaluationStatus, "insufficient_data"); assert.equal(body.families[1].publicStatus, "no_advisory");
assert.equal(body.families[2].evaluationStatus, "insufficient_data"); assert.equal(body.families[2].publicStatus, "no_advisory");
assert.equal(body.families[3].evaluationStatus, "insufficient_data"); assert.equal(body.families[3].publicStatus, "no_advisory");
const partialDailyRow = { payload_json: JSON.stringify(daily(5)), updated_at: "2026-09-15T00:00:00.000Z", expires_at: NOW + 60000 };
const partialHourlyRow = { payload_json: JSON.stringify({ hours: [] }), updated_at: "2026-09-15T00:00:00.000Z", expires_at: NOW + 60000 };
const partialResponse = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database({ dailyRow: partialDailyRow, hourlyRow: partialHourlyRow, ema: emaOk, rows: observations }) }, NOW);
const partialBody = await partialResponse.json(); const partialLow = partialBody.families.find((family) => family.id === "low_temperature");
assert.equal(partialBody.evaluation.status, "partial"); assert.equal(partialLow.evaluationStatus, "partial"); assert.equal(partialLow.publicStatus, "no_advisory");
const unavailable = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database() }, NOW);
assert.equal((await unavailable.json()).sourceStatus.forecast, "unavailable");

// Public response remains D1-only and lets the thunderstorm family use a
// fresh local capture even when the upstream TTL has elapsed.
const stormRow = { payload_json: JSON.stringify(stormDaily(34, 3)), updated_at: new Date(NOW).toISOString(), expires_at: NOW - 1 };
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("/api/advisories must never fetch Meteored"); };
const stormResponse = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database({ dailyRow: stormRow, hourlyRow: null, ema: emaOk, rows: observations }) }, NOW);
globalThis.fetch = originalFetch;
const stormBody = await stormResponse.json();
assert.equal(stormBody.families.find((family) => family.id === "thunderstorm").publicStatus, "active");
assert.equal(stormBody.families.find((family) => family.id === "low_temperature").publicStatus, "no_advisory");

const corruptRow = { payload_json: "{", updated_at: "2026-09-15T00:00:00.000Z", expires_at: NOW + 60000 };
const corruptResponse = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database({ dailyRow: corruptRow, hourlyRow: corruptRow, ema: emaOk, rows: observations }) }, NOW);
const corruptBody = await corruptResponse.json();
assert.equal(corruptBody.evaluation.status, "partial", "The engine status remains diagnostic");
assert.deepEqual(corruptBody.families.map((family) => family.publicStatus), ["unavailable", "unavailable", "unavailable", "unavailable"]);

const multiFamily = evaluateAdvisories({ evaluators: [
  () => evaluateLowTemperature({ daily: daily(4), hourly: dawn(), now: NOW }),
  () => storm({ daily: stormDaily(34) })
] });
assert.deepEqual(multiFamily.families.map((family) => family.publicStatus), ["active", "active"]);

console.log("advisories tests: OK (HIGH_TEMP, WIND, LOW_TEMP and THUNDERSTORM deterministic scenarios)");
