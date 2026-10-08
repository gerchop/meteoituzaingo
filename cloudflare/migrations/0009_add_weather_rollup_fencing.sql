-- P1-B4b: additive durable concurrency state. No canonical rows are changed.

ALTER TABLE weather_rollup_state ADD COLUMN backfill_lease_token TEXT;
ALTER TABLE weather_rollup_state ADD COLUMN backfill_fence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE weather_rollup_state ADD COLUMN canonical_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE weather_rollup_state ADD COLUMN validation_canonical_revision INTEGER;

-- SQLite has no IANA timezone database. Argentina is UTC-03 for the project's
-- stored period; the application keeps America/Argentina/Buenos_Aires for display.
CREATE TRIGGER weather_observations_rollup_revision
AFTER INSERT ON weather_observations
BEGIN
  SELECT (CASE
    WHEN julianday(NEW.observed_at) IS NULL THEN RAISE(ABORT, 'invalid observed_at for rollup revision')
  END);

  UPDATE weather_rollup_state
  SET
    canonical_revision = canonical_revision + 1,
    dirty_from_local_date = (CASE
      WHEN dirty_from_local_date IS NULL THEN date(datetime(NEW.observed_at), '-3 hours')
      WHEN date(datetime(NEW.observed_at), '-3 hours') < dirty_from_local_date THEN date(datetime(NEW.observed_at), '-3 hours')
      ELSE dirty_from_local_date
    END),
    validation_cursor_observed_at = NULL,
    validation_passed_at = NULL,
    validation_canonical_revision = NULL,
    status = (CASE WHEN status = 'ready' THEN 'repairing' ELSE status END),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = 1;
END;
