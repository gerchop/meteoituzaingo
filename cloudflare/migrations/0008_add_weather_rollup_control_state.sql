-- P1-B2a: durable control state for a future authenticated runner.

ALTER TABLE weather_rollup_state ADD COLUMN backfill_lease_until TEXT;
ALTER TABLE weather_rollup_state ADD COLUMN validation_cursor_observed_at TEXT;
ALTER TABLE weather_rollup_state ADD COLUMN validation_passed_at TEXT;
