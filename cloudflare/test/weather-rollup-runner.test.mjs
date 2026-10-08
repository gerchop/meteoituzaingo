import assert from "node:assert/strict";
import worker from "../src/index.js";
import { acquireBackfillLease, readRollupStatus, releaseBackfillLease, runControlledBackfill } from "../src/weather-rollup-runner.js";
const NOW = new Date("2026-10-07T12:00:00.000Z");
class FakeDb {
  constructor() { this.state = { id: 1, status: "backfilling", observation_count: 250, rollup_cursor_observed_at: "2026-10-07T11:50:00.000Z", backfill_lease_until: null, backfill_lease_token: null, backfill_fence: 0, canonical_revision: 0 }; }
  prepare(sql) { const db = this; const statement = (values = []) => ({
    first: async () => {
      if (sql.startsWith("SELECT id, status")) return structuredClone(db.state);
      if (sql.startsWith("UPDATE weather_rollup_state SET backfill_lease_token")) { const [token, until, now] = values; if (db.state.backfill_lease_until && db.state.backfill_lease_until > now) return null; db.state.backfill_lease_token = token; db.state.backfill_fence += 1; db.state.backfill_lease_until = until; return { backfill_lease_token: token, backfill_fence: db.state.backfill_fence, backfill_lease_until: until }; }
      throw new Error(`FIRST no simulado: ${sql}`);
    },
    run: async () => { if (sql.startsWith("UPDATE weather_rollup_state SET backfill_lease_until=NULL")) { const [token, fence, until] = values; const owned = db.state.backfill_lease_token === token && db.state.backfill_fence === fence && db.state.backfill_lease_until === until; if (owned) { db.state.backfill_lease_until = null; db.state.backfill_lease_token = null; } return { meta: { changes: owned ? 1 : 0 } }; } throw new Error(`RUN no simulado: ${sql}`); }
  }); const base = statement(); base.bind = (...values) => statement(values); return base; }
}
const db = new FakeDb();
const leaseA = await acquireBackfillLease(db, NOW, 120_000, () => "A"); assert.equal(leaseA.acquired, true); assert.equal((await acquireBackfillLease(db, NOW, 120_000, () => "second")).acquired, false);
db.state.backfill_lease_until = new Date(NOW.getTime() - 1).toISOString(); const leaseB = await acquireBackfillLease(db, new Date(NOW.getTime() + 1), 120_000, () => "B"); assert.ok(leaseB.fence > leaseA.fence); assert.equal(await releaseBackfillLease(db, leaseA), false); assert.equal(await releaseBackfillLease(db, leaseB), true);
let receivedLease; const batch = await runControlledBackfill(db, { now: NOW, runBatch: async (_database, options) => { receivedLease = options.lease; return { processed: 1, complete: false, cursor: "x" }; } }); assert.equal(batch.ok, true); assert.equal(receivedLease.token != null, true); assert.equal(db.state.backfill_lease_until, null);
await assert.rejects(() => runControlledBackfill(db, { now: NOW, runBatch: async () => { throw new Error("fallo controlado"); } })); assert.equal(db.state.backfill_lease_until, null);
assert.equal((await readRollupStatus(db)).backfill_fence, db.state.backfill_fence);
for (const path of ["status", "backfill", "validate", "finalize"]) { const method = path === "status" ? "GET" : "POST"; const response = await worker.fetch(new Request(`https://worker.example/api/admin/weather-rollups/${path}`, { method }), { ALLOWED_ORIGINS: "https://gerchop.github.io" }); assert.equal(response.status, 401, `${path} exige ADMIN_TOKEN`); }
console.log("weather rollup runner tests: OK (durable lease ownership and auth)");