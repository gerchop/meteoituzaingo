export async function insertObservation(database, observation) {
  const createdAt = new Date().toISOString();
  const result = await database.prepare(`INSERT OR IGNORE INTO weather_observations (
    observed_at, temperature, feels_like, humidity, pressure, wind_speed, wind_gust,
    wind_direction, wind_direction_degrees, precip_rate, precip_total, dew_point,
    weather_condition, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(observation.observedAt, observation.temperature, observation.feelsLike, observation.humidity, observation.pressure, observation.windSpeed, observation.windGust, observation.windDirection, observation.windDirectionDegrees, observation.precipRate, observation.precipTotal, observation.dewPoint, observation.weatherCondition, createdAt)
    .run();
  return { inserted: result.meta.changes === 1, observedAt: observation.observedAt };
}

export function serializeObservation(row) {
  if (!row) return null;
  return {
    observedAt: row.observed_at,
    temperature: row.temperature,
    feelsLike: row.feels_like,
    humidity: row.humidity,
    pressure: row.pressure,
    windSpeed: row.wind_speed,
    windGust: row.wind_gust,
    windDirection: row.wind_direction,
    windDirectionDegrees: row.wind_direction_degrees,
    precipRate: row.precip_rate,
    precipTotal: row.precip_total,
    dewPoint: row.dew_point,
    weatherCondition: row.weather_condition
  };
}
