-- Persistent, conservative scheduler state for the existing */10 capture cron.
-- The bootstrap delays the first attempt by 24h so deployment never retries a
-- known exhausted upstream quota immediately.
CREATE TABLE IF NOT EXISTS meteored_refresh_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  next_refresh_at INTEGER NOT NULL,
  backoff_until INTEGER,
  last_status INTEGER,
  lock_until INTEGER,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO meteored_refresh_state (id, next_refresh_at, updated_at)
VALUES (1, (strftime('%s', 'now') * 1000) + 86400000, datetime('now'));
