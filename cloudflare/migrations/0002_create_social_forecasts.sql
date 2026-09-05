CREATE TABLE IF NOT EXISTS social_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_date TEXT NOT NULL UNIQUE,
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_timestamp TEXT,
  generator_version TEXT NOT NULL,
  morning_summary TEXT,
  morning_wind TEXT,
  night_summary TEXT,
  night_wind TEXT,
  min_temp REAL,
  max_temp REAL,
  original_text TEXT,
  final_text TEXT,
  parts_json TEXT NOT NULL,
  parts_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  source_summary_json TEXT
);

CREATE TABLE IF NOT EXISTS social_forecast_cache (
  source_type TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_login_limits (
  client_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  locked_until INTEGER
);
