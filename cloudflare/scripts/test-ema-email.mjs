import { sendEmaHealthEmail } from "../src/ema-health.js";

const env = { RESEND_API_KEY: process.env.RESEND_API_KEY, EMA_ALERT_RECIPIENT: process.env.EMA_ALERT_RECIPIENT };
const message = { subject: "Meteo Ituzaingó — Prueba monitor EMA", body: "Prueba controlada del sistema de notificación v1.11.\nNo corresponde a una falla real de la estación.", idempotencyKey: `ema-test:${new Date().toISOString().replace(/[-:.TZ]/g, "")}` };
try { const receipt = await sendEmaHealthEmail(env, message); console.log(JSON.stringify({ ok: true, messageId: receipt.id })); }
catch (error) { console.error(JSON.stringify({ ok: false, error: String(error?.message || "EMA_EMAIL_FAILURE") })); process.exitCode = 1; }
