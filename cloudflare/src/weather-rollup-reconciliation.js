import { ARGENTINA_TIME_ZONE, localDate } from "./weather-rollups.js";
import { rebuildArtDay, deriveGlobalRecordsFromDaily } from "./weather-rollup-computation.js";

export const RECONCILIATION_DAY_BATCH_SIZE = 3;
const DAY_COLUMNS = ["local_date", "first_observed_at", "last_observed_at", "observation_count", "temperature_count", "temperature_sum", "temperature_min", "temperature_min_at", "temperature_max", "temperature_max_at", "humidity_count", "humidity_sum", "humidity_min", "humidity_min_at", "humidity_max", "humidity_max_at", "pressure_count", "pressure_sum", "pressure_min", "pressure_min_at", "pressure_max", "pressure_max_at", "wind_count", "wind_sum", "wind_max", "wind_max_at", "gust_max", "gust_max_at", "precipitation_total", "precipitation_sample_count", "last_precip_total", "last_precip_observed_at"];
const RECORD_METRICS = ["temperature_max", "temperature_min", "wind_gust_max", "pressure_max", "pressure_min", "humidity_max", "humidity_min", "precipitation_daily_max"];
const formatter = new Intl.DateTimeFormat("en-US", { timeZone: ARGENTINA_TIME_ZONE, timeZoneName: "longOffset", year: "numeric", month: "2-digit", day: "2-digit" });

function offsetMs(instant) {
  const value = formatter.formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) throw new Error("ART_TIMEZONE_OFFSET_UNAVAILABLE");
  return (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}
function nextLocalDate(date) { return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10); }
function localMidnight(date) {
  const nominal = Date.parse(`${date}T00:00:00.000Z`);
  let instant = nominal - offsetMs(nominal);
  // Resolve using the offset at the resulting instant; safe if Argentina ever changes offset.
  instant = nominal - offsetMs(instant);
  return instant;
}
export function artDayUtcRange(date) { const start = localMidnight(date); const end = localMidnight(nextLocalDate(date)); return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }; }
function fenceClause() { return "EXISTS (SELECT 1 FROM weather_rollup_state AS fence WHERE fence.id=1 AND fence.backfill_lease_token=? AND fence.backfill_fence=? AND julianday(fence.backfill_lease_until) > julianday('now') AND fence.canonical_revision=?)"; }
function fenceValues(lease, revision) { return [lease.token, lease.fence, revision]; }
function iso(now) { return new Date(now).toISOString(); }
function dateAtOrAfter(left, right) { return !right || left >= right; }
function stateMetadata(days) {
  const populated = days.filter(Boolean);
  return {
    observation_count: populated.reduce((total, day) => total + Number(day.observation_count || 0), 0),
    first_observed_at: populated.map((day) => day.first_observed_at).filter(Boolean).sort()[0] || null,
    last_observed_at: populated.map((day) => day.last_observed_at).filter(Boolean).sort().at(-1) || null
  };
}
function dayWrite(database, day, stamp, lease, revision) {
  const columns = [...DAY_COLUMNS, "updated_at"];
  const update = columns.filter((column) => column !== "local_date").map((column) => `${column}=excluded.${column}`).join(", ");
  const guard = fenceClause();
  return database.prepare(`INSERT INTO weather_daily_aggregates (${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE ${guard} ON CONFLICT(local_date) DO UPDATE SET ${update} WHERE ${guard}`).bind(...columns.map((column) => column === "updated_at" ? stamp : day[column]), ...fenceValues(lease, revision), ...fenceValues(lease, revision));
}
function deleteRecord(database, metric, lease, revision) { return database.prepare(`DELETE FROM weather_record_values WHERE metric=? AND ${fenceClause()}`).bind(metric, ...fenceValues(lease, revision)); }
function recordWrite(database, record, stamp, lease, revision) { return database.prepare(`INSERT INTO weather_record_values (metric,numeric_value,observed_at,local_date,updated_at) SELECT ?,?,?,?,? WHERE ${fenceClause()}`).bind(record.metric, record.numeric_value, record.observed_at, record.local_date, stamp, ...fenceValues(lease, revision)); }
function stateWrite(database, metadata, nextCursor, complete, dirty, target, resetIncrementalDirty, stamp, lease, revision) {
  const clear = complete ? "NULL" : "dirty_from_local_date";
  return database.prepare(`UPDATE weather_rollup_state SET first_observed_at=?,last_observed_at=?,observation_count=?,reconciliation_cursor_local_date=?,reconciliation_target_revision=?,reconciliation_started_at=CASE WHEN reconciliation_started_at IS NULL THEN ? ELSE reconciliation_started_at END,reconciliation_dirty_from_local_date=CASE WHEN ? THEN NULL ELSE reconciliation_dirty_from_local_date END,dirty_from_local_date=${clear},validation_cursor_observed_at=NULL,validation_passed_at=NULL,validation_canonical_revision=NULL,status='repairing',last_reconciled_at=?,updated_at=? WHERE id=1 AND dirty_from_local_date=? AND ${fenceClause()}`).bind(metadata.first_observed_at, metadata.last_observed_at, metadata.observation_count, complete ? null : nextCursor, complete ? null : target, stamp, complete || resetIncrementalDirty ? 1 : 0, stamp, stamp, dirty, ...fenceValues(lease, revision));
}
async function ownsLease(database, state, lease) {
  if (!lease?.token || !Number.isInteger(lease.fence) || state.backfill_lease_token !== lease.token || Number(state.backfill_fence) !== lease.fence) return false;
  return Boolean(await database.prepare("SELECT 1 FROM weather_rollup_state WHERE id=1 AND backfill_lease_token=? AND backfill_fence=? AND julianday(backfill_lease_until)>julianday('now')").bind(lease.token, lease.fence).first());
}

// Deliberately requires a caller-owned P1-B lease. Runner integration is deferred to P1-C3.
export async function reconcileRollupBatch(database, { lease, dayBatchSize = RECONCILIATION_DAY_BATCH_SIZE, now = new Date() } = {}) {
  const state = await database.prepare("SELECT * FROM weather_rollup_state WHERE id=1").first();
  if (!state) throw new Error("ROLLUP_STATE_MISSING");
  if (!lease) throw new Error("RECONCILIATION_LEASE_REQUIRED");
  if (!state.rollup_cursor_observed_at) return { processedDays: 0, complete: false, blocked: "initial_backfill_incomplete" };
  if (!state.dirty_from_local_date) return { processedDays: 0, complete: true, idle: true };
  if (!await ownsLease(database, state, lease)) return { processedDays: 0, complete: false, fenced: true };
  const revision = Number(state.canonical_revision);
  const dirty = state.dirty_from_local_date;
  const cursor = state.reconciliation_cursor_local_date || dirty;
  if (state.reconciliation_cursor_local_date && state.reconciliation_target_revision !== null && state.reconciliation_target_revision !== revision) {
    const changedFrom = state.reconciliation_dirty_from_local_date || dirty;
    const safeCursor = changedFrom < cursor ? changedFrom : cursor;
    const rebase = await database.batch([database.prepare(`UPDATE weather_rollup_state SET reconciliation_cursor_local_date=?, reconciliation_target_revision=NULL, reconciliation_started_at=NULL, validation_cursor_observed_at=NULL, validation_passed_at=NULL, validation_canonical_revision=NULL, updated_at=? WHERE id=1 AND dirty_from_local_date=? AND ${fenceClause()}`).bind(safeCursor, iso(now), dirty, ...fenceValues(lease, revision))]);
    if (Number(rebase[0]?.meta?.changes || 0) !== 1) return { processedDays: 0, complete: false, fenced: true };
    return { processedDays: 0, complete: false, rebased: true, cursor: safeCursor, revision };
  }
  const target = state.reconciliation_target_revision ?? revision;
  const adoptionDirty = state.reconciliation_target_revision === null ? (state.reconciliation_dirty_from_local_date || dirty) : null;
  const safeAdoptionCursor = adoptionDirty && adoptionDirty < cursor ? adoptionDirty : cursor;
  const newest = await database.prepare("SELECT observed_at FROM weather_observations ORDER BY observed_at DESC LIMIT 1").first();
  const lastDate = newest?.observed_at ? localDate(newest.observed_at) : cursor;
  const processingCursor = safeAdoptionCursor;
  if (!dateAtOrAfter(lastDate, processingCursor)) return { processedDays: 0, complete: false, fenced: true, reason: "invalid_cursor" };
  const dates = []; for (let date = processingCursor; date <= lastDate && dates.length < dayBatchSize; date = nextLocalDate(date)) dates.push(date);
  const allDaily = (await database.prepare("SELECT * FROM weather_daily_aggregates ORDER BY local_date ASC").all()).results || [];
  const replacements = [];
  for (const date of dates) { const range = artDayUtcRange(date); const rows = (await database.prepare("SELECT * FROM weather_observations WHERE observed_at>=? AND observed_at<? ORDER BY observed_at ASC").bind(range.start, range.end).all()).results || []; replacements.push(rebuildArtDay(date, rows)); }
  const replacementByDate = new Map(dates.map((date, index) => [date, replacements[index]]));
  const logicalDays = [...allDaily.filter((day) => !replacementByDate.has(day.local_date)), ...replacements.filter(Boolean)].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const records = deriveGlobalRecordsFromDaily(logicalDays);
  const nextCursor = nextLocalDate(dates.at(-1)); const complete = nextCursor > lastDate;
  const stamp = iso(now); const metadata = stateMetadata(logicalDays);
  const writes = replacements.filter(Boolean).map((day) => dayWrite(database, day, stamp, lease, revision));
  // A canonical table only grows today; keep the absent-day branch explicit for future-safe repair semantics.
  for (const date of dates.filter((date) => !replacementByDate.get(date))) writes.push(database.prepare(`DELETE FROM weather_daily_aggregates WHERE local_date=? AND ${fenceClause()}`).bind(date, ...fenceValues(lease, revision)));
  for (const metric of RECORD_METRICS) writes.push(deleteRecord(database, metric, lease, revision));
  for (const record of records.values()) writes.push(recordWrite(database, record, stamp, lease, revision));
  writes.push(stateWrite(database, metadata, nextCursor, complete, dirty, target, state.reconciliation_target_revision === null, stamp, lease, revision));
  const result = await database.batch(writes); const stateResult = result.at(-1);
  if (Number(stateResult?.meta?.changes || 0) !== 1) return { processedDays: 0, complete: false, fenced: true };
  return { processedDays: dates.length, complete, cursor: complete ? null : nextCursor, revision: target };
}