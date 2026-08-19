CREATE TABLE IF NOT EXISTS weather_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL UNIQUE,
  temperature REAL NOT NULL,
  feels_like REAL,
  humidity REAL,
  pressure REAL,
  wind_speed REAL,
  wind_gust REAL,
  wind_direction TEXT,
  wind_direction_degrees REAL,
  precip_rate REAL,
  precip_total REAL,
  dew_point REAL,
  weather_condition TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_observations_observed_at
  ON weather_observations(observed_at);
