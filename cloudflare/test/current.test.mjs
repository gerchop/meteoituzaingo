import assert from "node:assert/strict";
import worker from "../src/index.js";

const row = { observed_at: new Date().toISOString(), temperature: 12.3, feels_like: 11.8, humidity: 70, pressure: 1014.2, wind_speed: 15, wind_gust: 22, wind_direction: "NE", wind_direction_degrees: 45, precip_rate: 0, precip_total: 1.2, dew_point: 6.8, weather_condition: "Parcialmente nublado" };
function env(currentRow) { return { ALLOWED_ORIGINS: "https://gerchop.github.io", HISTORY_DB: { prepare() { return { first: async () => currentRow }; } } }; }
const request = new Request("https://worker.example/api/current", { headers: { Origin: "https://gerchop.github.io" } });
const fresh = await worker.fetch(request, env(row)); const freshBody = await fresh.json();
assert.equal(fresh.status, 200); assert.equal(fresh.headers.get("Access-Control-Allow-Origin"), "https://gerchop.github.io"); assert.equal(fresh.headers.get("Content-Type"), "application/json; charset=utf-8"); assert.equal(freshBody.ok, true); assert.equal(freshBody.source, "d1"); assert.equal(freshBody.sourceStatus, "available"); assert.equal(freshBody.observation.temperature, 12.3); assert.ok(Number.isFinite(Date.parse(freshBody.observation.observedAt))); assert.equal(JSON.stringify(freshBody).includes("WEATHER_API_KEY"), false); assert.equal(JSON.stringify(freshBody).includes("apiKey"), false);
const stale = await worker.fetch(request, env({ ...row, observed_at: new Date(Date.now() - 21 * 60 * 1000).toISOString() })); const staleBody = await stale.json(); assert.equal(staleBody.sourceStatus, "stale"); assert.equal(staleBody.observation.temperature, 12.3);
const missing = await worker.fetch(request, env(null)); const missingBody = await missing.json(); assert.equal(missingBody.sourceStatus, "unavailable"); assert.equal(missingBody.observation, null);
const originalFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error("/api/current must only read D1"); }; const noFetch = await worker.fetch(request, env(row)); await noFetch.json(); globalThis.fetch = originalFetch;
const dashboard = await (await import("node:fs/promises")).readFile(new URL("../../js/dashboard.js", import.meta.url), "utf8"); assert.equal(dashboard.includes("api.weather.com"), false); assert.equal(dashboard.includes("apiKey="), false); assert.ok(dashboard.includes("/api/current")); assert.equal((dashboard.match(/setInterval\(cargarClima/g) || []).length, 1);
console.log("current observation tests: OK (14 deterministic scenarios)");
