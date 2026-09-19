import assert from "node:assert/strict";
import { buildSocialForecast, ForecastAvailabilityError, getNextMeteoredRefreshSlot, maintainForecastCache, publicForecast, readForecastCache, METEORED_REFRESH_INTERVAL_MS, METEORED_QUOTA_BACKOFF_MS } from "../src/social-forecast.js";

const NOW = Date.parse("2026-09-18T15:00:00.000Z");
const env = { METEORED_API_KEY: "test", METEORED_LOCATION_HASH: "location" };

function database({ state = null, cache = {} } = {}) {
  const db = { state, cache: structuredClone(cache), writes: [] };
  db.prepare = (sql) => ({
    first: async () => sql.includes("meteored_refresh_state") ? db.state : null,
    bind(...values) { return {
    first: async () => sql.includes("meteored_refresh_state") ? db.state : (db.cache[values[0]] || null),
    run: async () => {
      if (sql.startsWith("INSERT OR IGNORE INTO meteored_refresh_state")) { if (!db.state) db.state = { id: 1, next_refresh_at: values[0], updated_at: values[1], lock_until: null, backoff_until: null }; return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE meteored_refresh_state SET next_refresh_at")) { if (db.state && !db.state.last_attempt_at && !db.state.last_success_at && !db.state.backoff_until) Object.assign(db.state, { next_refresh_at: values[0], updated_at: values[1] }); return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE meteored_refresh_state SET lock_until")) { const [lease, attempt, updated, now] = values; const eligible = db.state && (!db.state.lock_until || db.state.lock_until <= now) && db.state.next_refresh_at <= now && (!db.state.backoff_until || db.state.backoff_until <= now); if (eligible) Object.assign(db.state, { lock_until: lease, last_attempt_at: attempt, updated_at: updated }); return { meta: { changes: eligible ? 1 : 0 } }; }
      if (sql.startsWith("UPDATE meteored_refresh_state SET last_attempt_at")) { const [attempt, success, next, backoff, status, updated] = values; Object.assign(db.state, { last_attempt_at: attempt, last_success_at: success, next_refresh_at: next, backoff_until: backoff, last_status: status, updated_at: updated, lock_until: null }); return { meta: { changes: 1 } }; }
      if (sql.startsWith("INSERT INTO social_forecast_cache")) { const [type, expires_at, payload_json, updated_at] = values; db.cache[type] = { expires_at, payload_json, updated_at }; db.writes.push(type); return { meta: { changes: 1 } }; }
      throw new Error(`SQL no simulado: ${sql}`);
    }
  }; } });
  return db;
}

function response(type, expiresAt = NOW + 60000) { return new Response(JSON.stringify({ ok: true, data: type === "hourly" ? { hours: [] } : { days: [] }, expiracion: expiresAt }), { status: 200 }); }
function setFetch(handler) { globalThis.fetch = async (url) => handler(url.includes("/hourly/") ? "hourly" : "daily"); }
const originalFetch = globalThis.fetch;
const art = (date, hour, minute = 0) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
for (const [hour, minute, expectedHour] of [[0, 1, 4], [3, 59, 4], [4, 1, 8], [7, 59, 8], [8, 1, 12], [11, 59, 12], [12, 1, 16], [15, 59, 16], [16, 1, 20], [19, 59, 20], [20, 1, 0], [23, 59, 0]]) {
  const next = new Date(getNextMeteoredRefreshSlot(art("2026-09-18", hour, minute)));
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hourCycle: "h23" }).format(next);
  assert.equal(Number(local), expectedHour, `${hour}:${minute}`);
}
assert.equal(getNextMeteoredRefreshSlot(art("2026-09-18", 15, 11)), art("2026-09-18", 16));

{
  const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: null, backoff_until: null } }); let calls = 0;
  setFetch((type) => { calls += 1; return response(type); });
  for (let offset = 0; offset < 86400000; offset += 600000) await maintainForecastCache(db, env, NOW + offset);
  assert.equal(calls, 12); assert.equal(db.writes.length, 12);
}
{
  const db = database({ state: { id: 1, next_refresh_at: NOW + METEORED_REFRESH_INTERVAL_MS, lock_until: null, backoff_until: null }, cache: { hourly: { expires_at: NOW + 60000, payload_json: '{"hours":[]}', updated_at: new Date(NOW).toISOString() } } }); let calls = 0;
  setFetch(() => { calls += 1; throw new Error("no corresponde"); }); await maintainForecastCache(db, env, NOW + 600000); assert.equal(calls, 0);
}
{
  const cache = { hourly: { expires_at: NOW - 1, payload_json: JSON.stringify({ start: NOW - 14 * 3600000, hours: Array.from({ length: 4 }, (_, index) => ({ end: NOW + (index + 1) * 3600000 })) }), updated_at: new Date(NOW - 13 * 3600000).toISOString() }, daily: { expires_at: NOW - 1, payload_json: '{"days":[]}', updated_at: new Date(NOW - 1000).toISOString() } }; const db = database({ cache }); let calls = 0;
  setFetch(() => { calls += 1; throw new Error("prohibido"); }); for (let index = 0; index < 100; index += 1) assert.equal((await publicForecast(db, "hourly", NOW)).cache.stale, true); assert.equal((await readForecastCache(db, "daily", NOW)).cache.stale, true); await buildSocialForecast(db, env, "2026-09-18"); assert.equal(calls, 0);
}
{
  const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: null, backoff_until: null } }); let calls = 0; setFetch((type) => { calls += 1; return response(type); }); const [first, second] = await Promise.all([maintainForecastCache(db, env, NOW), maintainForecastCache(db, env, NOW)]); assert.equal(calls, 2); assert.ok([first.status, second.status].includes("locked"));
}
{
  const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: null, backoff_until: null } }); let calls = 0; setFetch(() => { calls += 1; return new Response("{}", { status: 429 }); }); const result = await maintainForecastCache(db, env, NOW); assert.equal(result.daily, "skipped"); assert.equal(calls, 1); assert.equal(db.state.last_status, 429); assert.equal(db.state.backoff_until, NOW + METEORED_QUOTA_BACKOFF_MS); await maintainForecastCache(db, env, NOW + 600000); assert.equal(calls, 1);
}
for (const status of [401, 403, 503]) { const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: null, backoff_until: null } }); let calls = 0; setFetch(() => { calls += 1; return new Response("{}", { status }); }); await maintainForecastCache(db, env, NOW); await maintainForecastCache(db, env, NOW + 600000); assert.ok(calls <= (status >= 500 ? 2 : 1), `backoff ${status}`); }
{
  const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: null, backoff_until: null } }); let calls = 0;
  setFetch(() => { calls += 1; throw new TypeError("network unavailable"); }); await maintainForecastCache(db, env, NOW); await maintainForecastCache(db, env, NOW + 600000); assert.equal(calls, 2); assert.ok(db.state.backoff_until > NOW);
}
for (const failedType of ["hourly", "daily"]) { const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: null, backoff_until: null }, cache: { hourly: { expires_at: NOW - 1, payload_json: '{"hours":[1]}', updated_at: new Date(NOW).toISOString() } } }); setFetch((type) => type === failedType ? new Response("down", { status: 503 }) : response(type)); const result = await maintainForecastCache(db, env, NOW); assert.equal(result.status, "partial"); assert.ok(db.cache.hourly); assert.ok(db.state.backoff_until > NOW); }
{
  const db = database({ state: { id: 1, next_refresh_at: NOW, lock_until: NOW - 1, backoff_until: null } }); let calls = 0; setFetch((type) => { calls += 1; return response(type); }); await maintainForecastCache(db, env, NOW); assert.equal(calls, 2);
}

function hourlyRow({ updatedAt = NOW, start = NOW - 3600000, ends = [] } = {}) { return { expires_at: NOW - 1, updated_at: new Date(updatedAt).toISOString(), payload_json: JSON.stringify({ start, hours: ends.map((end) => ({ end, symbol: 3 })) }) }; }
async function hourlyState(row, now = NOW) { return publicForecast(database({ cache: { hourly: row } }), "hourly", now); }
function futureEnds(count, now = NOW, firstOffset = 3600000) { return Array.from({ length: count }, (_, index) => now + firstOffset + index * 3600000); }
{
  const result = await hourlyState(hourlyRow({ ends: futureEnds(12) })); assert.equal(result.cache.state, "FRESH"); assert.equal(result.cache.futureSlots, 12); assert.equal(result.data.hours.length, 12);
}
for (const count of [12, 8, 4]) {
  const result = await hourlyState(hourlyRow({ updatedAt: NOW - 13 * 3600000, start: NOW - 14 * 3600000, ends: futureEnds(count) })); assert.equal(result.cache.state, "STALE_USABLE"); assert.equal(result.cache.stale, true); assert.equal(result.cache.futureSlots, count);
}
for (const count of [3, 2, 1, 0]) {
  const ends = count ? futureEnds(count) : [NOW - 3600000]; await assert.rejects(() => hourlyState(hourlyRow({ updatedAt: NOW - 13 * 3600000, start: NOW - 14 * 3600000, ends })), (error) => error instanceof ForecastAvailabilityError && error.state === "EXHAUSTED" && error.cache.futureSlots === count);
}
{
  const result = await hourlyState(hourlyRow({ updatedAt: NOW - 13 * 3600000, start: NOW - 14 * 3600000, ends: [NOW, ...futureEnds(4)] })); assert.equal(result.cache.futureSlots, 4, "un slot exactamente now no es futuro"); assert.ok(result.data.hours.every((slot) => slot.end > NOW));
}
{
  const midnight = Date.parse("2026-09-19T00:00:00-03:00"); const row = hourlyRow({ updatedAt: midnight - 13 * 3600000, start: midnight - 14 * 3600000, ends: [midnight - 10800000, midnight - 7200000, midnight - 3600000, midnight] });
  await assert.rejects(() => hourlyState(row, midnight - 1), (error) => error.state === "EXHAUSTED" && error.cache.futureSlots === 1); await assert.rejects(() => hourlyState(row, midnight), (error) => error.state === "EXHAUSTED" && error.cache.futureSlots === 0);
}
{
  const row = hourlyRow({ updatedAt: NOW - 13 * 3600000, start: NOW - 14 * 3600000, ends: [NOW + 7200000, NOW + 3600000, NOW + 3600000, NOW + 10800000, NOW + 14400000] }); const result = await hourlyState(row); assert.equal(result.cache.futureSlots, 4); assert.deepEqual(result.data.hours.map((slot) => slot.end), futureEnds(4));
}
for (const row of [
  { expires_at: NOW, updated_at: new Date(NOW).toISOString(), payload_json: "{" },
  hourlyRow({ ends: [] }),
  hourlyRow({ ends: ["invalid"] }),
  hourlyRow({ start: NOW + 3 * 3600000, ends: futureEnds(12) }),
  hourlyRow({ ends: Array.from({ length: 4 }, (_, index) => NOW + (365 + index) * 86400000) })
]) await assert.rejects(() => hourlyState(row), (error) => error instanceof ForecastAvailabilityError && error.state === "UNAVAILABLE");
{
  const daily = { expires_at: NOW - 1, updated_at: new Date(NOW - 47 * 3600000).toISOString(), payload_json: '{"days":[]}' }; const result = await publicForecast(database({ cache: { daily } }), "daily", NOW); assert.equal(result.cache.stale, true, "daily conserva su límite de 48h");
}
globalThis.fetch = originalFetch;
console.log("forecast cache tests: OK (scheduler, stale utility, lock, quota, auth, failures and partial recovery)");
