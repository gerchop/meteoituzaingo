-- P1-C2B/C3.1: state for the separately controlled reconciliation runner.
-- rollup_cursor_observed_at remains exclusively the initial-backfill cursor.
ALTER TABLE weather_rollup_state ADD COLUMN reconciliation_cursor_local_date TEXT;
ALTER TABLE weather_rollup_state ADD COLUMN reconciliation_target_revision INTEGER;
ALTER TABLE weather_rollup_state ADD COLUMN reconciliation_started_at TEXT;
ALTER TABLE weather_rollup_state ADD COLUMN reconciliation_dirty_from_local_date TEXT;

-- Captures that arrive after a reconciliation target is fixed are tracked
-- independently from the long-lived minimum dirty marker.
CREATE TRIGGER weather_observations_reconciliation_dirty
AFTER INSERT ON weather_observations
BEGIN
  UPDATE weather_rollup_state
  SET reconciliation_dirty_from_local_date = (CASE
    WHEN reconciliation_dirty_from_local_date IS NULL THEN date(datetime(NEW.observed_at), '-3 hours')
    WHEN date(datetime(NEW.observed_at), '-3 hours') < reconciliation_dirty_from_local_date THEN date(datetime(NEW.observed_at), '-3 hours')
    ELSE reconciliation_dirty_from_local_date
  END)
  WHERE id = 1;
END;