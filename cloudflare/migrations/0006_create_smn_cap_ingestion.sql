CREATE TABLE IF NOT EXISTS smn_ingestion_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  feed_url TEXT,
  discovery_checked_at TEXT,
  feed_fetched_at TEXT,
  last_success_at TEXT,
  scan_generation INTEGER NOT NULL DEFAULT 0,
  bootstrap_completed INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,
  next_retry_at TEXT,
  last_error_code TEXT,
  last_complete_scan_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS smn_cap_items (
  cap_url TEXT PRIMARY KEY,
  cap_identifier TEXT,
  msg_type TEXT,
  references_text TEXT,
  sent_at TEXT,
  onset_at TEXT,
  expires_at TEXT,
  applicable_to_ituzaingo INTEGER NOT NULL DEFAULT 0,
  public_payload_json TEXT,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'retry', 'success')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  processed_at TEXT,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_smn_cap_items_pending
  ON smn_cap_items(processing_status, next_retry_at, priority, first_seen_at);
CREATE INDEX IF NOT EXISTS idx_smn_cap_items_active
  ON smn_cap_items(applicable_to_ituzaingo, expires_at);
CREATE INDEX IF NOT EXISTS idx_smn_cap_items_identifier
  ON smn_cap_items(cap_identifier);

CREATE TABLE IF NOT EXISTS smn_cap_references (
  source_identifier TEXT NOT NULL,
  referenced_identifier TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('UPDATE', 'CANCEL')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_identifier, referenced_identifier, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_smn_cap_references_target
  ON smn_cap_references(referenced_identifier);
