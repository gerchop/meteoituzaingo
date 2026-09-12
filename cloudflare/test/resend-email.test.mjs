import assert from "node:assert/strict";
import { EMA_EMAIL_CONFIG, sendEmaHealthEmail } from "../src/ema-health.js";
const env = { RESEND_API_KEY: "test-key", EMA_ALERT_RECIPIENT: "owner@example.test" };
const message = { subject: "Prueba", body: "Cuerpo", idempotencyKey: "ema:incident:STALE" };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const keys = []; for (const status of [200, 202]) assert.equal((await sendEmaHealthEmail(env, message, async (_url, options) => { keys.push(options.headers["Idempotency-Key"]); return response(status, { id: `m-${status}` }); })).status, status); assert.deepEqual(keys, ["ema:incident:STALE", "ema:incident:STALE"]);
for (const type of ["REMINDER", "RECOVERY"]) { const key = `ema:incident:${type}`; await sendEmaHealthEmail(env, { ...message, idempotencyKey: key }, async (_url, options) => { assert.equal(options.headers["Idempotency-Key"], key); return response(200, { id: key }); }); }
for (const status of [400, 401, 403, 429, 500]) await assert.rejects(sendEmaHealthEmail(env, message, async () => response(status, { message: "x" })), new RegExp(`EMA_EMAIL_HTTP_${status}`));
await assert.rejects(sendEmaHealthEmail(env, message, async () => { throw new Error("network"); }), /network/);
await assert.rejects(sendEmaHealthEmail(env, message, async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }))), /EMA_EMAIL_TIMEOUT/);
await assert.rejects(sendEmaHealthEmail(env, message, async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } })), /EMA_EMAIL_INVALID_JSON/);
await assert.rejects(sendEmaHealthEmail({}, message, async () => response(200, { id: "x" })), /EMA_EMAIL_KEY_MISSING/);
await assert.rejects(sendEmaHealthEmail({ RESEND_API_KEY: "x" }, message, async () => response(200, { id: "x" })), /EMA_EMAIL_RECIPIENT_MISSING/);
await assert.rejects(sendEmaHealthEmail(env, { subject: "x", body: "x" }, async () => response(200, { id: "x" })), /EMA_EMAIL_IDEMPOTENCY_MISSING/);
assert.equal(EMA_EMAIL_CONFIG.from, "Meteo Ituzaingó <onboarding@resend.dev>"); assert.equal(EMA_EMAIL_CONFIG.timeoutMs, 8000);
console.log("resend-email tests: OK (13 deterministic scenarios)");
