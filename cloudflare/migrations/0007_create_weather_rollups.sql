-- P1-A: derived structures only. weather_observations remains canonical.

CREATE TABLE IF NOT EXISTS weather_rollup_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  first_observed_at TEXT,
  last_observed_at TEXT,
  observation_count INTEGER NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  rollup_cursor_observed_at TEXT,
  dirty_from_local_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending_backfill'
    CHECK (status IN ('pending_backfill', 'backfilling', 'ready', 'repairing', 'failed')),
  last_reconciled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The singleton deliberately remains pending until P1-B validates backfill.
INSERT OR IGNORE INTO weather_rollup_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS weather_daily_aggregates (
  local_date TEXT PRIMARY KEY CHECK (local_date GLOB '????-??-??'),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  observation_count INTEGER NOT NULL CHECK (observation_count >= 0),

  temperature_count INTEGER NOT NULL DEFAULT 0 CHECK (temperature_count >= 0),
  temperature_sum REAL NOT NULL DEFAULT 0,
  temperature_min REAL,
  temperature_min_at TEXT,
  temperature_max REAL,
  temperature_max_at TEXT,

  humidity_count INTEGER NOT NULL DEFAULT 0 CHECK (humidity_count >= 0),
  humidity_sum REAL NOT NULL DEFAULT 0,
  humidity_min REAL,
  humidity_min_at TEXT,
  humidity_max REAL,
  humidity_max_at TEXT,

  pressure_count INTEGER NOT NULL DEFAULT 0 CHECK (pressure_count >= 0),
  pressure_sum REAL NOT NULL DEFAULT 0,
  pressure_min REAL,
  pressure_min_at TEXT,
  pressure_max REAL,
  pressure_max_at TEXT,

  wind_count INTEGER NOT NULL DEFAULT 0 CHECK (wind_count >= 0),
  wind_sum REAL NOT NULL DEFAULT 0,
  wind_max REAL,
  wind_max_at TEXT,

  gust_max REAL,
  gust_max_at TEXT,

  precipitation_total REAL,
  precipitation_sample_count INTEGER NOT NULL DEFAULT 0 CHECK (precipitation_sample_count >= 0),
  last_precip_total REAL,
  last_precip_observed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weather_record_values (
  metric TEXT PRIMARY KEY,
  numeric_value REAL,
  observed_at TEXT,
  local_date TEXT CHECK (local_date IS NULL OR local_date GLOB '????-??-??'),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (observed_at IS NULL OR local_date IS NULL)
);
