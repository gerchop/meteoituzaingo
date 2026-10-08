import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { acquireBackfillLease, finalizeControlledBackfill, releaseBackfillLease, validateControlledBackfill } from "../src/weather-rollup-runner.js";
import { backfillBatch } from "../src/weather-rollups.js";

const ISO = (value) => new Date(value).toISOString();
const START = new Date();

class Statement {
  constructor(owner, sql, values = []) { this.owner = owner; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.owner, this.sql, values); }
  async first() { return this.owner.db.prepare(this.sql).get(...this.values) || null; }
  async all() {
    if (this.owner.beforeRawRead && this.sql.startsWith("SELECT * FROM weather_observations WHERE")) {
      const hook = this.owner.beforeRawRead; this.owner.beforeRawRead = null; hook();
    }
    return { results: this.owner.db.prepare(this.sql).all(...this.values) };
  }
  async run() { const result = this.owner.db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
}
class LocalD1 {
  constructor({ failAt = null } = {}) { this.db = new DatabaseSync(":memory:"); this.failAt = failAt; this.beforeRawRead = null; this.schema(); }
  schema() {
    this.db.exec(`CREATE TABLE weather_observations (observed_at TEXT PRIMARY KEY, temperature REAL, humidity REAL, pressure REAL, wind_speed REAL, wind_gust REAL, precip_total REAL);
CREATE TABLE weather_rollup_state (id INTEGER PRIMARY KEY, first_observed_at TEXT, last_observed_at TEXT, observation_count INTEGER NOT NULL DEFAULT 0, rollup_cursor_observed_at TEXT, dirty_from_local_date TEXT, status TEXT NOT NULL DEFAULT 'pending_backfill', last_reconciled_at TEXT, updated_at TEXT, backfill_lease_until TEXT, validation_cursor_observed_at TEXT, validation_passed_at TEXT, backfill_lease_token TEXT, backfill_fence INTEGER NOT NULL DEFAULT 0, canonical_revision INTEGER NOT NULL DEFAULT 0, validation_canonical_revision INTEGER);
INSERT INTO weather_rollup_state (id) VALUES (1);
CREATE TABLE weather_daily_aggregates (local_date TEXT PRIMARY KEY, first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL, observation_count INTEGER NOT NULL, temperature_count INTEGER NOT NULL, temperature_sum REAL NOT NULL, temperature_min REAL, temperature_min_at TEXT, temperature_max REAL, temperature_max_at TEXT, humidity_count INTEGER NOT NULL, humidity_sum REAL NOT NULL, humidity_min REAL, humidity_min_at TEXT, humidity_max REAL, humidity_max_at TEXT, pressure_count INTEGER NOT NULL, pressure_sum REAL NOT NULL, pressure_min REAL, pressure_min_at TEXT, pressure_max REAL, pressure_max_at TEXT, wind_count INTEGER NOT NULL, wind_sum REAL NOT NULL, wind_max REAL, wind_max_at TEXT, gust_max REAL, gust_max_at TEXT, precipitation_total REAL, precipitation_sample_count INTEGER NOT NULL, last_precip_total REAL, last_precip_observed_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE weather_record_values (metric TEXT PRIMARY KEY, numeric_value REAL, observed_at TEXT, local_date TEXT, updated_at TEXT NOT NULL);
CREATE TRIGGER weather_observations_rollup_revision AFTER INSERT ON weather_observations BEGIN UPDATE weather_rollup_state SET canonical_revision=canonical_revision+1, dirty_from_local_date=date(datetime(NEW.observed_at), '-3 hours'), validation_cursor_observed_at=NULL, validation_passed_at=NULL, validation_canonical_revision=NULL WHERE id=1; END;`);
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const output = [];
      for (let index = 0; index < statements.length; index += 1) {
        if (this.failAt === index) throw new Error("INJECTED_BATCH_FAILURE");
        output.push(await statements[index].run());
      }
      this.db.exec("COMMIT"); return output;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  insert(at, temperature = 20) { this.db.prepare("INSERT INTO weather_observations (observed_at, temperature, humidity, pressure, wind_speed, wind_gust, precip_total) VALUES (?, ?, 50, 1000, 10, 20, 0)").run(at, temperature); }
  state() { return this.db.prepare("SELECT * FROM weather_rollup_state WHERE id=1").get(); }
  snapshot() { return { state: this.state(), days: this.db.prepare("SELECT * FROM weather_daily_aggregates ORDER BY local_date").all(), records: this.db.prepare("SELECT * FROM weather_record_values ORDER BY metric").all() }; }
}
function seeded(options) { const db = new LocalD1(options); db.insert("2026-10-08T03:00:00.000Z"); db.insert("2026-10-08T03:10:00.000Z", 22); return db; }

const db = seeded();
const leaseA = await acquireBackfillLease(db, START, 60_000, () => "lease-A");
assert.equal(leaseA.acquired, true);
db.db.prepare("UPDATE weather_rollup_state SET backfill_lease_until='2000-01-01T00:00:00.000Z' WHERE id=1").run();
const leaseB = await acquireBackfillLease(db, START, 60_000, () => "lease-B");
assert.equal(leaseB.acquired, true); assert.ok(leaseB.fence > leaseA.fence);
const beforeA = db.snapshot();
const staleA = await backfillBatch(db, { now: START, batchSize: 10, lease: leaseA });
assert.equal(staleA.fenced, true); assert.deepEqual(db.snapshot(), beforeA, "A no persiste agregados, records ni cursor después de B");
assert.equal(await releaseBackfillLease(db, leaseA), false, "A no libera lease de B"); assert.equal(db.state().backfill_lease_token, "lease-B");
const batchB = await backfillBatch(db, { now: START, batchSize: 10, lease: leaseB });
assert.equal(batchB.processed, 2); assert.equal(db.state().rollup_cursor_observed_at, "2026-10-08T03:10:00.000Z"); assert.ok(db.snapshot().days.length); assert.ok(db.snapshot().records.length);
db.db.prepare("UPDATE weather_rollup_state SET backfill_lease_until='2000-01-01T00:00:00.000Z' WHERE id=1").run(); const afterB = db.snapshot();
assert.equal((await backfillBatch(db, { now: START, batchSize: 10, lease: { ...leaseB, token: "wrong" } })).fenced, true, "token incorrecto rechazado");
assert.deepEqual(db.snapshot(), afterB);
assert.equal((await backfillBatch(db, { now: START, batchSize: 10, lease: { ...leaseB, fence: leaseB.fence - 1 } })).fenced, true, "fence antiguo rechazado");
assert.equal((await backfillBatch(db, { now: START, batchSize: 10, lease: leaseB })).fenced, true, "lease vencido rechazado");
assert.deepEqual(db.snapshot(), afterB);
assert.equal((await backfillBatch(db, { now: START, batchSize: 10, lease: leaseB })).processed, 0, "ejecución duplicada no reescribe");

const failed = seeded({ failAt: 1 }); const leaseFailed = await acquireBackfillLease(failed, START, 60_000, () => "lease-failure"); const beforeFailure = failed.snapshot();
await assert.rejects(() => backfillBatch(failed, { now: new Date(START.getTime() + 1_000), batchSize: 10, lease: leaseFailed }), /INJECTED_BATCH_FAILURE/);
assert.deepEqual(failed.snapshot(), beforeFailure, "un error intermedio revierte el lote completo"); failed.failAt = null;
assert.equal((await backfillBatch(failed, { now: new Date(START.getTime() + 2_000), batchSize: 10, lease: leaseFailed })).processed, 2, "recuperación posterior al rollback");

const revised = seeded(); const leaseRevised = await acquireBackfillLease(revised, START, 60_000, () => "lease-revision"); revised.beforeRawRead = () => revised.insert("2026-10-08T03:20:00.000Z", 23); const beforeRevision = revised.snapshot();
const staleRevision = await backfillBatch(revised, { now: new Date(START.getTime() + 1_000), batchSize: 10, lease: leaseRevised });
assert.equal(staleRevision.fenced, true, "un cambio canónico invalida el lote"); assert.deepEqual(revised.snapshot().days, beforeRevision.days); assert.deepEqual(revised.snapshot().records, beforeRevision.records); assert.equal(revised.state().rollup_cursor_observed_at, null);
console.log("weather rollup fencing tests: OK (A/B, token, fence, expiry, duplicate, rollback and canonical revision)");
const control = seeded();
control.db.prepare("UPDATE weather_rollup_state SET rollup_cursor_observed_at=?, dirty_from_local_date=NULL, status='backfilling' WHERE id=1").run("2026-10-08T03:10:00.000Z");
const controlLease = await acquireBackfillLease(control, START, 60_000, () => "lease-control");
const validation = await validateControlledBackfill(control, { lease: controlLease, validate: async () => ({ ok: true, mismatches: [] }) });
assert.equal(validation.ok, true, "validate persiste evidencia sólo para la revisión actual");
control.db.prepare("UPDATE weather_rollup_state SET dirty_from_local_date='2026-10-08' WHERE id=1").run();
assert.equal((await finalizeControlledBackfill(control, { lease: controlLease })).ok, false, "dirty pendiente bloquea ready");
control.db.prepare("UPDATE weather_rollup_state SET dirty_from_local_date=NULL, validation_canonical_revision=canonical_revision-1 WHERE id=1").run();
assert.equal((await finalizeControlledBackfill(control, { lease: controlLease })).ok, false, "evidencia de revisión obsoleta bloquea ready");
control.db.prepare("UPDATE weather_rollup_state SET validation_canonical_revision=canonical_revision, rollup_cursor_observed_at='2026-10-08T03:00:00.000Z' WHERE id=1").run();
assert.equal((await finalizeControlledBackfill(control, { lease: controlLease })).ok, false, "cursor incompleto bloquea ready");
control.db.prepare("UPDATE weather_rollup_state SET rollup_cursor_observed_at='2026-10-08T03:10:00.000Z', backfill_lease_until='2000-01-01T00:00:00.000Z' WHERE id=1").run();
assert.equal((await finalizeControlledBackfill(control, { lease: controlLease })).conflict, true, "lease vencido bloquea ready");
const successor = await acquireBackfillLease(control, START, 60_000, () => "lease-successor");
assert.equal((await finalizeControlledBackfill(control, { lease: { ...successor, token: "wrong" } })).conflict, true, "token incorrecto bloquea ready");
assert.equal((await finalizeControlledBackfill(control, { lease: { ...successor, fence: successor.fence - 1 } })).conflict, true, "fence antiguo bloquea ready");
console.log("weather rollup control tests: OK (validate revision, dirty, cursor, expiry, token and fence)");