CREATE TABLE IF NOT EXISTS ema_health_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_freshness TEXT NOT NULL CHECK (data_freshness IN ('FRESH', 'STALE', 'UNKNOWN')),
  capture_health TEXT NOT NULL CHECK (capture_health IN ('OK', 'ERROR', 'UNKNOWN')),
  latest_observed_at TEXT,
  stale_since TEXT,
  current_incident_id TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ema_health_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('STALE', 'REMINDER', 'RECOVERY')),
  idempotency_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  lease_until TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ema_health_outbox_pending
  ON ema_health_outbox(status, next_attempt_at, lease_until);
