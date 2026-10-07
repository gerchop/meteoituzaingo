import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0007_create_weather_rollups.sql", import.meta.url), "utf8");
for (const table of ["weather_rollup_state", "weather_daily_aggregates", "weather_record_values"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(migration, /id INTEGER PRIMARY KEY CHECK \(id = 1\)/);
assert.match(migration, /DEFAULT 'pending_backfill'/);
assert.match(migration, /INSERT OR IGNORE INTO weather_rollup_state \(id\) VALUES \(1\)/);
assert.match(migration, /local_date TEXT PRIMARY KEY CHECK \(local_date GLOB '\?\?\?\?-\?\?-\?\?'\)/);
assert.match(migration, /metric TEXT PRIMARY KEY/);
assert.doesNotMatch(migration, /ALTER TABLE\s+weather_observations/i);
assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP)\b/i);
assert.doesNotMatch(migration, /CREATE INDEX/i);
console.log("weather-rollup-schema tests: OK (11 schema safety assertions)");
