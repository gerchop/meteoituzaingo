import { runControlledBackfill, runControlledFinalize, runControlledReconciliation, runControlledValidation } from "./weather-rollup-runner.js";

export const ROLLUP_AUTO_INCREMENTAL_FLAG = "ROLLUP_AUTO_INCREMENTAL_ENABLED";
export const ROLLUP_AUTO_CERTIFICATION_FLAG = "ROLLUP_AUTO_CERTIFICATION_ENABLED";

export function rollupAutomationEnabled(env, flag) {
  return env?.[flag] === "true";
}

function defaultRunners() {
  return { backfill: runControlledBackfill, reconcile: runControlledReconciliation, validate: runControlledValidation, finalize: runControlledFinalize };
}

function unsafe(result) {
  return !result?.ok || result.conflict || !result.complete;
}

// Exactly one bounded batch. A later cron continues any remaining backlog.
export async function runIncrementalRollupMaintenance(database, env, runners = defaultRunners()) {
  if (!rollupAutomationEnabled(env, ROLLUP_AUTO_INCREMENTAL_FLAG)) return { enabled: false, skipped: "disabled" };
  const backfill = await runners.backfill(database);
  return { enabled: true, phase: "incremental_backfill", backfill, complete: Boolean(backfill?.ok && backfill.complete) };
}

// Stops at the first unsafe result: no retries and no unbounded work in a cron.
export async function runDailyRollupCertification(database, env, runners = defaultRunners()) {
  if (!rollupAutomationEnabled(env, ROLLUP_AUTO_CERTIFICATION_FLAG)) return { enabled: false, skipped: "disabled" };
  const backfill = await runners.backfill(database);
  if (unsafe(backfill)) return { enabled: true, phase: "backfill", backfill, complete: false };
  const reconcile = await runners.reconcile(database);
  if (unsafe(reconcile)) return { enabled: true, phase: "reconcile", backfill, reconcile, complete: false };
  const validation = await runners.validate(database);
  if (unsafe(validation)) return { enabled: true, phase: "validate", backfill, reconcile, validation, complete: false };
  const finalize = await runners.finalize(database);
  return { enabled: true, phase: "finalize", backfill, reconcile, validation, finalize, complete: Boolean(finalize?.ok) };
}
