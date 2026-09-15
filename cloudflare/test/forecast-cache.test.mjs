import assert from "node:assert/strict";
import { maintainForecastCache } from "../src/social-forecast.js";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
function database(rows) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      let type;
      return {
        bind(...values) { type = values[0]; this.values = values; return this; },
        first: async () => rows[type] || null,
        async run() { writes.push({ type: this.values[0], expiresAt: this.values[1] }); rows[this.values[0]] = { expires_at: this.values[1], payload_json: this.values[2] }; return { success: true }; }
      };
    }
  };
}
const freshRows = { hourly: { expires_at: NOW + 3600000, payload_json: JSON.stringify({ hours: [] }) }, daily: { expires_at: NOW + 3600000, payload_json: JSON.stringify({ days: [] }) } };
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls += 1; throw new Error("No debe llamarse Meteored con cache vigente"); };
assert.deepEqual((await maintainForecastCache(database(freshRows), { METEORED_API_KEY: "test", METEORED_LOCATION_HASH: "location" }, NOW)).map((item) => item.status), ["fulfilled", "fulfilled"]);
assert.equal(calls, 0);

const nearRows = { hourly: { expires_at: NOW + 300000, payload_json: JSON.stringify({ hours: [{ end: NOW }] }) }, daily: { expires_at: NOW + 300000, payload_json: JSON.stringify({ days: [] }) } };
const nearDb = database(nearRows); calls = 0;
globalThis.fetch = async (url) => { calls += 1; const type = url.includes("/hourly/") ? "hourly" : "daily"; return new Response(JSON.stringify({ ok: true, data: type === "hourly" ? { hours: [] } : { days: [] }, expiracion: NOW + 7200000 }), { status: 200 }); };
assert.deepEqual((await maintainForecastCache(nearDb, { METEORED_API_KEY: "test", METEORED_LOCATION_HASH: "location" }, NOW)).map((item) => item.status), ["fulfilled", "fulfilled"]);
assert.equal(calls, 2); assert.equal(nearDb.writes.length, 2);

const expiredRows = { hourly: { expires_at: NOW - 1, payload_json: JSON.stringify({ hours: [{ end: NOW - 1 }] }) }, daily: { expires_at: NOW - 1, payload_json: JSON.stringify({ days: [] }) } };
const expiredDb = database(expiredRows); calls = 0;
globalThis.fetch = async (url) => { calls += 1; if (url.includes("/hourly/")) return new Response("down", { status: 503 }); return new Response(JSON.stringify({ ok: true, data: { days: [] }, expiracion: NOW + 7200000 }), { status: 200 }); };
const result = await maintainForecastCache(expiredDb, { METEORED_API_KEY: "test", METEORED_LOCATION_HASH: "location" }, NOW);
assert.deepEqual(result.map((item) => item.status), ["rejected", "fulfilled"]); assert.equal(calls, 2); assert.equal(expiredDb.writes.length, 1);
assert.equal(expiredRows.hourly.expires_at, NOW - 1, "un fallo no debe borrar el último cache conocido");
globalThis.fetch = originalFetch;

console.log("forecast cache tests: OK (12 deterministic scenarios)");
