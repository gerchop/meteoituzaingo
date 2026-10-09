import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const harness = `import { runControlledReconciliation } from "./weather-rollup-runner.js";
export default { async fetch(_request, env) { const result = await runControlledReconciliation(env.DB); return Response.json(result); } };`;
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name:"reconciliation-harness", compatibilityDate:"2026-09-10", modules:[
  { type:"ESModule",path:"harness.mjs",contents:harness },
  { type:"ESModule",path:"weather-rollup-reconciliation.js",contents:await source("../src/weather-rollup-reconciliation.js") },
  { type:"ESModule",path:"weather-rollup-runner.js",contents:await source("../src/weather-rollup-runner.js") },
  { type:"ESModule",path:"weather-rollup-computation.js",contents:await source("../src/weather-rollup-computation.js") },
  { type:"ESModule",path:"weather-rollups.js",contents:await source("../src/weather-rollups.js") }
], d1Databases:["DB"] }] }));
try {
  const db = await mf.getD1Database("DB");
  // Individual D1 statements avoid the Miniflare exec migration-file splitter; Wrangler local applies 0001/0007/0008/0009/0010 separately.
  const schema = [
    "CREATE TABLE weather_observations (observed_at TEXT PRIMARY KEY,temperature REAL,humidity REAL,pressure REAL,wind_speed REAL,wind_gust REAL,precip_total REAL,created_at TEXT)",
    "CREATE TABLE weather_daily_aggregates (local_date TEXT PRIMARY KEY,first_observed_at TEXT NOT NULL,last_observed_at TEXT NOT NULL,observation_count INTEGER NOT NULL,temperature_count INTEGER NOT NULL,temperature_sum REAL NOT NULL,temperature_min REAL,temperature_min_at TEXT,temperature_max REAL,temperature_max_at TEXT,humidity_count INTEGER NOT NULL,humidity_sum REAL NOT NULL,humidity_min REAL,humidity_min_at TEXT,humidity_max REAL,humidity_max_at TEXT,pressure_count INTEGER NOT NULL,pressure_sum REAL NOT NULL,pressure_min REAL,pressure_min_at TEXT,pressure_max REAL,pressure_max_at TEXT,wind_count INTEGER NOT NULL,wind_sum REAL NOT NULL,wind_max REAL,wind_max_at TEXT,gust_max REAL,gust_max_at TEXT,precipitation_total REAL,precipitation_sample_count INTEGER NOT NULL,last_precip_total REAL,last_precip_observed_at TEXT,updated_at TEXT NOT NULL)",
    "CREATE TABLE weather_record_values (metric TEXT PRIMARY KEY,numeric_value REAL,observed_at TEXT,local_date TEXT,updated_at TEXT NOT NULL)",
    "CREATE TABLE weather_rollup_state (id INTEGER PRIMARY KEY,first_observed_at TEXT,last_observed_at TEXT,observation_count INTEGER NOT NULL DEFAULT 0,rollup_cursor_observed_at TEXT,dirty_from_local_date TEXT,status TEXT NOT NULL DEFAULT 'pending_backfill',last_reconciled_at TEXT,updated_at TEXT,backfill_lease_until TEXT,validation_cursor_observed_at TEXT,validation_passed_at TEXT,backfill_lease_token TEXT,backfill_fence INTEGER NOT NULL DEFAULT 0,canonical_revision INTEGER NOT NULL DEFAULT 0,validation_canonical_revision INTEGER,reconciliation_cursor_local_date TEXT,reconciliation_target_revision INTEGER,reconciliation_started_at TEXT,reconciliation_dirty_from_local_date TEXT)",
    "INSERT INTO weather_rollup_state (id,updated_at) VALUES (1,'2026-10-08T00:00:00.000Z')"
  ];
  await db.batch(schema.map((sql) => db.prepare(sql)));
  const put = (at, temperature) => db.prepare("INSERT INTO weather_observations (observed_at,temperature,humidity,pressure,wind_speed,wind_gust,precip_total,created_at) VALUES (?, ?, 50, 1000, 10, 20, 0, ?)").bind(at,temperature,"2026-10-08T00:00:00.000Z").run();
  await put("2026-01-01T03:00:00.000Z",20); await put("2026-01-02T03:00:00.000Z",10);
  await db.prepare("UPDATE weather_rollup_state SET rollup_cursor_observed_at=?,dirty_from_local_date=NULL,canonical_revision=2,backfill_lease_token=NULL,backfill_fence=0,backfill_lease_until=NULL WHERE id=1").bind("2026-01-02T03:00:00.000Z").run();
  await put("2026-01-01T03:05:00.000Z",30); await db.prepare("UPDATE weather_rollup_state SET canonical_revision=3,dirty_from_local_date='2026-01-01' WHERE id=1").run();
  const success = await mf.dispatchFetch("https://harness.test/"); assert.equal(success.status,200); assert.equal((await success.json()).processedDays,2);
  assert.equal((await db.prepare("SELECT temperature_max FROM weather_daily_aggregates WHERE local_date='2026-01-01'").first()).temperature_max,30);
  assert.equal((await db.prepare("SELECT numeric_value FROM weather_record_values WHERE metric='temperature_max'").first()).numeric_value,30);  // A later capture changes revision but only affects a date after the saved cursor.
  await db.prepare("UPDATE weather_rollup_state SET dirty_from_local_date='2026-01-01',reconciliation_cursor_local_date='2026-01-02',reconciliation_target_revision=3,reconciliation_dirty_from_local_date='2026-01-03',canonical_revision=4 WHERE id=1").run();
  const rebased = await mf.dispatchFetch("https://harness.test/"); const rebaseResult = await rebased.json(); assert.equal(rebaseResult.rebased,true); assert.equal(rebaseResult.cursor,"2026-01-02");
  await db.prepare("UPDATE weather_rollup_state SET canonical_revision=5,reconciliation_dirty_from_local_date='2026-01-01' WHERE id=1").run();
  const resumed = await mf.dispatchFetch("https://harness.test/"); const resumedResult = await resumed.json(); assert.equal(resumedResult.complete,true,"real D1 binding adopts a historical dirty signal after rebase"); assert.equal((await db.prepare("SELECT reconciliation_cursor_local_date FROM weather_rollup_state WHERE id=1").first()).reconciliation_cursor_local_date,null);
  // Reopen dirty work and force an intermediate record insert failure inside the real D1 batch.
  await db.exec("UPDATE weather_rollup_state SET dirty_from_local_date='2026-01-01',reconciliation_cursor_local_date=NULL,reconciliation_target_revision=NULL; CREATE TRIGGER reconciliation_force_rollback BEFORE INSERT ON weather_record_values WHEN NEW.metric='temperature_max' BEGIN SELECT RAISE(ABORT,'forced reconciliation rollback'); END;");
  const before = await db.prepare("SELECT dirty_from_local_date,reconciliation_cursor_local_date,observation_count FROM weather_rollup_state WHERE id=1").first();
  const beforeDay = await db.prepare("SELECT temperature_max FROM weather_daily_aggregates WHERE local_date='2026-01-01'").first();
  const beforeRecords = (await db.prepare("SELECT metric,numeric_value,observed_at,local_date FROM weather_record_values ORDER BY metric").all()).results;
  const failed = await mf.dispatchFetch("https://harness.test/"); assert.equal(failed.status,500);
  assert.deepEqual(await db.prepare("SELECT dirty_from_local_date,reconciliation_cursor_local_date,observation_count FROM weather_rollup_state WHERE id=1").first(),before,"state rolls back in real D1");
  assert.deepEqual(await db.prepare("SELECT temperature_max FROM weather_daily_aggregates WHERE local_date='2026-01-01'").first(),beforeDay,"aggregate rolls back in real D1");
  assert.deepEqual((await db.prepare("SELECT metric,numeric_value,observed_at,local_date FROM weather_record_values ORDER BY metric").all()).results,beforeRecords,"records roll back in real D1");
  console.log("weather reconciliation Miniflare tests: OK (real binding, module execution, aggregate/record consistency and rollback)");
} finally { await mf.dispose(); }