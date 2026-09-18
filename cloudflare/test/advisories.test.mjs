import assert from "node:assert/strict";
import { advisoriesResponse, evaluateAdvisories, evaluateLowTemperature, evaluateThunderstorm, selectLowTemperatureTargetPeriod } from "../src/advisories.js";

const at = (date, hour) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00-03:00`);
const atLocal = (date, hour, minute = 0) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
const NOW = atLocal("2026-09-15", 8, 0);
const TARGET = "2026-09-15";
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

// Thunderstorm is daily-only for activation. Freshness is based on the local
// capture time, never on Meteored's short upstream expiration metadata.
const TOMORROW = "2026-09-16";
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
assert.deepEqual(body.families.map((family) => family.id), ["low_temperature", "thunderstorm"]);
assert.equal(body.families[1].publicStatus, "insufficient_data");
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
assert.equal(stormBody.families.find((family) => family.id === "thunderstorm").publicStatus, "advisory");
assert.equal(stormBody.families.find((family) => family.id === "low_temperature").publicStatus, "insufficient_data");

const multiFamily = evaluateAdvisories({ evaluators: [
  () => evaluateLowTemperature({ daily: daily(4), hourly: dawn(), now: NOW }),
  () => storm({ daily: stormDaily(34) })
] });
assert.deepEqual(multiFamily.families.map((family) => family.publicStatus), ["advisory", "advisory"]);

console.log("advisories tests: OK (92 deterministic scenarios)");
