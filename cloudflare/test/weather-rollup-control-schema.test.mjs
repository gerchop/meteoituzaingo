import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0008_add_weather_rollup_control_state.sql", import.meta.url), "utf8");
for (const column of ["backfill_lease_until", "validation_cursor_observed_at", "validation_passed_at"]) assert.match(migration, new RegExp(`ALTER TABLE weather_rollup_state ADD COLUMN ${column} TEXT;`));
assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP|CREATE TABLE|CREATE INDEX)\b/i);
assert.doesNotMatch(migration, /weather_observations/i);
assert.match(migration, /backfill_lease_until TEXT/);
assert.match(migration, /validation_cursor_observed_at TEXT/);
assert.match(migration, /validation_passed_at TEXT/);
