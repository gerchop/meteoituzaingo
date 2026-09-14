import assert from "node:assert/strict";
import { advisoriesResponse, evaluateLowTemperatureAdvisories, observationContext } from "../src/advisories.js";

const NOW = Date.parse("2026-06-01T03:00:00.000Z");
const at = (hour, overrides = {}) => ({ end: new Date(NOW + hour * 3600000).toISOString(), temperature: 8, temperature_feels_like: 8, ...overrides });
const fullDay = (overrides = {}) => ({ hours: Array.from({ length: 24 }, (_, hour) => at(hour, overrides[hour] || {})) });
const emaOk = { data_freshness: "FRESH", capture_health: "OK" };
const observations = [{ observed_at: new Date(NOW - 600000).toISOString(), temperature: 2, feels_like: 2 }, { observed_at: new Date(NOW - 1200000).toISOString(), temperature: 2, feels_like: 2 }];
const evaluate = (hourly, extra = {}) => evaluateLowTemperatureAdvisories({ hourly, now: NOW, ...extra });

assert.equal(evaluate(fullDay()).advisories.length, 0);
assert.equal(evaluate(fullDay({ 4: { temperature: 4 } })).advisories[0].category, "information");
assert.equal(evaluate(fullDay({ 4: { temperature: 3 } })).advisories[0].category, "information");
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } })).advisories[0].category, "attention");
assert.equal(evaluate(fullDay({ 4: { temperature: 1 } })).advisories[0].category, "attention");
assert.equal(evaluate(fullDay({ 4: { temperature_feels_like: 0 } })).advisories.length, 0);
assert.equal(evaluate(fullDay({ 4: { temperature_feels_like: 0 }, 5: { temperature_feels_like: 0 } })).advisories[0].category, "attention");
assert.equal(evaluate(fullDay({ 4: { temperature: 11, temperature_feels_like: 0 }, 5: { temperature: 11, temperature_feels_like: 0 } })).advisories.length, 0);
assert.equal(evaluate(fullDay({ 4: { temperature: 2, temperature_feels_like: 0 }, 5: { temperature_feels_like: 0 } })).advisories.length, 1);
assert.equal(evaluate({ hours: fullDay({ 4: { temperature_feels_like: 0 }, 5: { temperature_feels_like: 0 } }).hours.filter((_, index) => index !== 5) }).advisories.length, 0);
assert.equal(evaluate({ hours: fullDay().hours.slice(0, 17) }).sourceStatus.forecast, "insufficient");
assert.equal(observationContext(observations, emaOk, NOW).confirmed, true);
assert.equal(observationContext(observations, { data_freshness: "STALE", capture_health: "OK" }, NOW).confirmed, false);
assert.equal(observationContext(observations, { data_freshness: "FRESH", capture_health: "ERROR" }, NOW).confirmed, false);
assert.equal(observationContext(observations, { data_freshness: "UNKNOWN", capture_health: "UNKNOWN" }, NOW).confirmed, false);
assert.equal(observationContext(observations, null, NOW).confirmed, false);
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } }), { observationRows: observations, ema: emaOk }).advisories[0].basis.includes("observation_temperature"), true);
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } }), { observationRows: observations.slice(0, 1), ema: emaOk }).advisories[0].basis.includes("observation_temperature"), false);
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } }), { observationRows: observations, ema: { data_freshness: "STALE", capture_health: "OK" } }).advisories[0].category, "attention");
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } })).advisories[0].id, evaluate(fullDay({ 4: { temperature: 2 } })).advisories[0].id);
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } })).advisories[0].id, "low-temperature:attention:2026-06-01");
const originalFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error("No external request is allowed during advisory evaluation."); };
assert.equal(evaluate(fullDay({ 4: { temperature: 2 } })).advisories[0].category, "attention"); globalThis.fetch = originalFetch;

function database({ forecast = null, ema = null, rows = [] } = {}) {
  return { prepare(sql) { return { first: async () => sql.includes("social_forecast_cache") ? forecast : ema, all: async () => ({ results: rows }) }; } };
}
const request = new Request("https://worker.example/api/advisories", { headers: { Origin: "https://gerchop.github.io" } });
const unavailable = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database() }, NOW);
assert.equal((await unavailable.json()).sourceStatus.forecast, "unavailable");
const response = await advisoriesResponse(request, { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: database({ forecast: { payload_json: JSON.stringify(fullDay({ 4: { temperature: 2 } })), updated_at: "2026-06-01T00:00:00.000Z", expires_at: NOW + 60000 }, ema: emaOk, rows: observations }) }, NOW);
assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://gerchop.github.io"); assert.equal(response.headers.get("Cache-Control"), "public, max-age=300"); assert.equal((await response.json()).advisories[0].category, "attention");
console.log("advisories tests: OK (25 deterministic scenarios)");
