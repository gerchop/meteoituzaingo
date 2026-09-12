const THRESHOLD_MS = 30 * 60 * 1000;
const REMINDER_MS = 3 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const RETRY_MS = [10, 30, 60, 180].map((minutes) => minutes * 60 * 1000);
const ART = "America/Argentina/Buenos_Aires";

function iso(value) { return new Date(value).toISOString(); }
function validTime(value) { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : null; }
function art(value) { return new Intl.DateTimeFormat("es-AR", { timeZone: ART, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(value)); }
function duration(ms) { const total = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(total / 60)} h ${total % 60} min`; }
export function nextRetryAt(attempts, now) { const delay = RETRY_MS[Math.max(0, attempts - 1)] || 6 * 60 * 60 * 1000; return iso(Date.parse(now) + delay); }
export function evaluateFreshness(latestObservedAt, now) {
  const latest = validTime(latestObservedAt); const current = validTime(now);
  if (latest === null || current === null || latest > current + FUTURE_TOLERANCE_MS) return { value: "UNKNOWN", ageMs: null, latestObservedAt: latestObservedAt || null };
  const ageMs = current - latest;
  return { value: ageMs >= THRESHOLD_MS ? "STALE" : "FRESH", ageMs, latestObservedAt: iso(latest) };
}
function email(eventType, incidentId, latestObservedAt, now) {
  const age = duration(Date.parse(now) - Date.parse(latestObservedAt));
  if (eventType === "STALE") return { subject: "Meteo Ituzaingó — Sin nuevas observaciones", body: `Meteo Ituzaingó detectó que no se reciben nuevas observaciones de la estación.\n\nÚltima observación válida: ${art(latestObservedAt)} ART\nTiempo sin datos: ${age}\n\nRevisar consola EMA, conexión y transmisión.` };
  if (eventType === "REMINDER") return { subject: "Meteo Ituzaingó — Continúa sin recibir datos", body: `Meteo Ituzaingó continúa sin recibir nuevas observaciones de la estación.\n\nÚltima observación válida: ${art(latestObservedAt)} ART\nTiempo sin datos: ${age}\n\nRevisar consola EMA, conexión y transmisión.` };
  return { subject: "Meteo Ituzaingó — Observaciones recuperadas", body: `Meteo Ituzaingó volvió a recibir observaciones frescas de la estación.\n\nNueva observación: ${art(latestObservedAt)} ART\nDuración aproximada del episodio: ${duration(Date.parse(now) - Date.parse(incidentId))}.` };
}
function event(type, incidentId, latestObservedAt, now) { return { incidentId, eventType: type, idempotencyKey: `ema:${incidentId}:${type}`, ...email(type, incidentId, latestObservedAt, now) }; }
export function transitionEmaHealth(previous, latestObservedAt, captureHealth, now) {
  const freshness = evaluateFreshness(latestObservedAt, now); const prior = previous || {};
  const base = { dataFreshness: freshness.value, captureHealth, latestObservedAt: freshness.latestObservedAt, staleSince: null, currentIncidentId: null, lastErrorCode: captureHealth === "ERROR" ? "CAPTURE_ERROR" : null, updatedAt: now };
  if (freshness.value === "UNKNOWN") return { state: { ...base, currentIncidentId: prior.currentIncidentId || null, staleSince: prior.staleSince || null }, events: [] };
  if (freshness.value === "STALE") {
    const staleSince = iso(Date.parse(freshness.latestObservedAt) + THRESHOLD_MS); const incidentId = prior.dataFreshness === "STALE" && prior.currentIncidentId ? prior.currentIncidentId : staleSince;
    const events = []; if (prior.dataFreshness !== "STALE") events.push(event("STALE", incidentId, freshness.latestObservedAt, now));
    if (Date.parse(now) >= Date.parse(staleSince) + REMINDER_MS) events.push(event("REMINDER", incidentId, freshness.latestObservedAt, now));
    return { state: { ...base, staleSince, currentIncidentId: incidentId }, events };
  }
  const recovered = prior.dataFreshness === "STALE" && validTime(freshness.latestObservedAt) > validTime(prior.latestObservedAt);
  return { state: base, events: recovered ? [event("RECOVERY", prior.currentIncidentId, freshness.latestObservedAt, now)] : [] };
}
export function classifyCaptureError(error) { const message = String(error?.message || ""); if (/respondió 401|respondió 403/.test(message)) return "WEATHER_AUTH"; if (/Weather\.com respondió/.test(message)) return "WEATHER_HTTP"; if (/timestamp|observación|métrica/.test(message)) return "WEATHER_PAYLOAD"; return "CAPTURE_ERROR"; }

export async function monitorEmaHealth(database, { now = iso(Date.now()), captureHealth = "UNKNOWN", captureError = null } = {}) {
  const [current, maximum] = await Promise.all([database.prepare("SELECT * FROM ema_health_state WHERE id = 1").first(), database.prepare("SELECT MAX(observed_at) AS observed_at FROM weather_observations").first()]);
  const previous = current && { dataFreshness: current.data_freshness, latestObservedAt: current.latest_observed_at, staleSince: current.stale_since, currentIncidentId: current.current_incident_id };
  const result = transitionEmaHealth(previous, maximum?.observed_at, captureHealth, now);
  result.state.lastErrorCode = captureError ? classifyCaptureError(captureError) : result.state.lastErrorCode;
  const statements = [database.prepare("INSERT INTO ema_health_state (id, data_freshness, capture_health, latest_observed_at, stale_since, current_incident_id, last_error_code, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data_freshness=excluded.data_freshness, capture_health=excluded.capture_health, latest_observed_at=excluded.latest_observed_at, stale_since=excluded.stale_since, current_incident_id=excluded.current_incident_id, last_error_code=excluded.last_error_code, updated_at=excluded.updated_at").bind(result.state.dataFreshness, result.state.captureHealth, result.state.latestObservedAt, result.state.staleSince, result.state.currentIncidentId, result.state.lastErrorCode, now)];
  result.events.forEach((item) => statements.push(database.prepare("INSERT OR IGNORE INTO ema_health_outbox (incident_id, event_type, idempotency_key, subject, body, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)").bind(item.incidentId, item.eventType, item.idempotencyKey, item.subject, item.body, now, now)));
  await database.batch(statements);
  console.log(JSON.stringify({ event: "ema_health", freshness: result.state.dataFreshness, captureHealth, ageMs: evaluateFreshness(maximum?.observed_at, now).ageMs, incidentId: result.state.currentIncidentId, events: result.events.map((item) => item.eventType) }));
  return result;
}

export async function deliverEmaOutboxEvent(item, sender, now = iso(Date.now())) {
  try { const receipt = await sender({ subject: item.subject, body: item.body, eventType: item.eventType, idempotencyKey: item.idempotencyKey }); return { status: "SENT", attempts: item.attempts + 1, sentAt: now, providerMessageId: receipt?.id || null, nextAttemptAt: null, lastError: null }; }
  catch (error) { return { status: "PENDING", attempts: item.attempts + 1, sentAt: null, providerMessageId: null, nextAttemptAt: nextRetryAt(item.attempts + 1, now), lastError: classifyCaptureError(error) }; }
}
export async function processNextEmaOutbox(database, sender, now = iso(Date.now())) {
  const row = await claimNextEmaOutbox(database, now);
  if (!row) return null;
  const delivery = await deliverEmaOutboxEvent({ subject: row.subject, body: row.body, eventType: row.event_type, idempotencyKey: row.idempotency_key, attempts: row.attempts }, sender, now);
  const finalStatus = delivery.status === "PENDING" && isNonRetryableEmailError(delivery.lastError) ? "FAILED" : delivery.status;
  await database.prepare("UPDATE ema_health_outbox SET status = ?, attempts = ?, next_attempt_at = ?, sent_at = ?, lease_until = NULL, last_error = ? WHERE id = ? AND status = 'SENDING'").bind(finalStatus, delivery.attempts, finalStatus === "FAILED" ? null : delivery.nextAttemptAt, delivery.sentAt, delivery.lastError, row.id).run();
  console.log(JSON.stringify({ event: "ema_outbox", type: row.event_type, attempt: delivery.attempts, success: delivery.status === "SENT" }));
  return delivery;
}
export const EMA_OUTBOX_LEASE_MS = 10 * 60 * 1000;
export function outboxEligible(status, leaseUntil, now) { return status === "PENDING" || (status === "SENDING" && (!leaseUntil || Date.parse(leaseUntil) <= Date.parse(now))); }
export function isNonRetryableEmailError(error) { return /EMA_EMAIL_HTTP_409|invalid_idempotent_request/.test(String(error?.message || error)); }
export async function claimNextEmaOutbox(database, now = iso(Date.now())) {
  const row = await database.prepare("SELECT * FROM ema_health_outbox WHERE (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = 'SENDING' AND lease_until <= ?) ORDER BY created_at ASC LIMIT 1").bind(now, now).first();
  if (!row) return null;
  const leaseUntil = iso(Date.parse(now) + EMA_OUTBOX_LEASE_MS);
  const result = await database.prepare("UPDATE ema_health_outbox SET status = 'SENDING', lease_until = ? WHERE id = ? AND ((status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = 'SENDING' AND lease_until <= ?))").bind(leaseUntil, row.id, now, now).run();
  return result.meta.changes === 1 ? { ...row, status: "SENDING", lease_until: leaseUntil } : null;
}

// No provider request is implemented in Fase 1. Tests inject this interface; Fase 2 may bind Resend.
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TEST_FROM = "Meteo Ituzaingó <onboarding@resend.dev>";
const EMAIL_TIMEOUT_MS = 8000;
export async function sendEmaHealthEmail(env, message, fetcher = fetch) {
  if (!env?.RESEND_API_KEY) throw new Error("EMA_EMAIL_KEY_MISSING");
  if (!env?.EMA_ALERT_RECIPIENT) throw new Error("EMA_EMAIL_RECIPIENT_MISSING");
  if (!message?.idempotencyKey) throw new Error("EMA_EMAIL_IDEMPOTENCY_MISSING");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  try {
    const response = await fetcher(RESEND_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey }, body: JSON.stringify({ from: RESEND_TEST_FROM, to: [env.EMA_ALERT_RECIPIENT], subject: message.subject, text: message.body }), signal: controller.signal });
    let body; try { body = await response.json(); } catch { throw new Error("EMA_EMAIL_INVALID_JSON"); }
    if (!response.ok) throw new Error(`EMA_EMAIL_HTTP_${response.status}`);
    if (!body || typeof body.id !== "string" || !body.id) throw new Error("EMA_EMAIL_INVALID_RESPONSE");
    return { id: body.id, status: response.status };
  } catch (error) { if (error?.name === "AbortError") throw new Error("EMA_EMAIL_TIMEOUT"); throw error; }
  finally { clearTimeout(timer); }
}
export const EMA_EMAIL_CONFIG = { from: RESEND_TEST_FROM, timeoutMs: EMAIL_TIMEOUT_MS };
