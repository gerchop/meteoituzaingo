import assert from "node:assert/strict";
import { ROLLUP_AUTO_CERTIFICATION_FLAG, ROLLUP_AUTO_INCREMENTAL_FLAG, rollupAutomationEnabled, runDailyRollupCertification, runIncrementalRollupMaintenance } from "../src/weather-rollup-maintenance.js";

const database = {};
const calls = [];
function runners(overrides = {}) {
  return {
    backfill: async () => { calls.push("backfill"); return { ok: true, complete: true, processed: 1 }; },
    reconcile: async () => { calls.push("reconcile"); return { ok: true, complete: true, processedDays: 1 }; },
    validate: async () => { calls.push("validate"); return { ok: true, complete: true, mismatches: [] }; },
    finalize: async () => { calls.push("finalize"); return { ok: true }; },
    ...overrides
  };
}

assert.equal(rollupAutomationEnabled({}, ROLLUP_AUTO_INCREMENTAL_FLAG), false);
assert.equal(rollupAutomationEnabled({ [ROLLUP_AUTO_INCREMENTAL_FLAG]: "TRUE" }, ROLLUP_AUTO_INCREMENTAL_FLAG), false);
assert.equal(rollupAutomationEnabled({ [ROLLUP_AUTO_INCREMENTAL_FLAG]: "true" }, ROLLUP_AUTO_INCREMENTAL_FLAG), true);
calls.length = 0;
assert.deepEqual(await runIncrementalRollupMaintenance(database, {}, runners()), { enabled: false, skipped: "disabled" }); assert.deepEqual(calls, []);

// It is independent from capture outcome, so a later cron can heal prior backlog.
for (const captureOutcome of ["stored", "duplicate", "failed"]) {
  calls.length = 0;
  const result = await runIncrementalRollupMaintenance(database, { [ROLLUP_AUTO_INCREMENTAL_FLAG]: "true" }, runners());
  assert.equal(result.backfill.processed, 1, captureOutcome);
  assert.deepEqual(calls, ["backfill"], `${captureOutcome}: one bounded call only`);
}

calls.length = 0;
assert.deepEqual(await runDailyRollupCertification(database, {}, runners()), { enabled: false, skipped: "disabled" }); assert.deepEqual(calls, []);
calls.length = 0;
let result = await runDailyRollupCertification(database, { [ROLLUP_AUTO_CERTIFICATION_FLAG]: "true" }, runners({ backfill: async () => { calls.push("backfill"); return { ok: true, complete: false, processed: 250 }; } }));
assert.equal(result.phase, "backfill"); assert.deepEqual(calls, ["backfill"], "backlog stops certification");
calls.length = 0;
result = await runDailyRollupCertification(database, { [ROLLUP_AUTO_CERTIFICATION_FLAG]: "true" }, runners({ reconcile: async () => { calls.push("reconcile"); return { ok: true, complete: false, processedDays: 3 }; } }));
assert.equal(result.phase, "reconcile"); assert.deepEqual(calls, ["backfill", "reconcile"], "partial reconciliation stops certification");
calls.length = 0;
result = await runDailyRollupCertification(database, { [ROLLUP_AUTO_CERTIFICATION_FLAG]: "true" }, runners({ validate: async () => { calls.push("validate"); return { ok: false, complete: true, mismatches: ["daily.2026-10-08"] }; } }));
assert.equal(result.phase, "validate"); assert.deepEqual(calls, ["backfill", "reconcile", "validate"], "mismatch never finalizes");
calls.length = 0;
result = await runDailyRollupCertification(database, { [ROLLUP_AUTO_CERTIFICATION_FLAG]: "true" }, runners({ finalize: async () => { calls.push("finalize"); return { ok: false, conflict: true }; } }));
assert.equal(result.phase, "finalize"); assert.equal(result.complete, false); assert.deepEqual(calls, ["backfill", "reconcile", "validate", "finalize"], "conflict is not retried");
calls.length = 0;
result = await runDailyRollupCertification(database, { [ROLLUP_AUTO_CERTIFICATION_FLAG]: "true" }, runners());
assert.equal(result.complete, true); assert.deepEqual(calls, ["backfill", "reconcile", "validate", "finalize"]);
calls.length = 0;
await assert.rejects(() => runIncrementalRollupMaintenance(database, { [ROLLUP_AUTO_INCREMENTAL_FLAG]: "true" }, runners({ backfill: async () => { calls.push("backfill"); throw new Error("D1 unavailable"); } })), /D1 unavailable/);
assert.deepEqual(calls, ["backfill"], "runner errors are not retried internally");
console.log("weather rollup maintenance tests: OK (flags, bounded execution, conflicts, mismatches and no retries)");
