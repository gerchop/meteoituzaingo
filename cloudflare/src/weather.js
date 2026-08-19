const WEATHER_ENDPOINT = "https://api.weather.com/v2/pws/observations/current";
const DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

function finiteOrNull(value) { return Number.isFinite(value) ? value : null; }

export function normalizeWeatherObservation(payload) {
  const observation = payload && Array.isArray(payload.observations) ? payload.observations[0] : null;
  if (!observation || !observation.metric || !Number.isFinite(observation.metric.temp)) throw new Error("Respuesta Weather.com sin observación métrica válida");
  const timestamp = Date.parse(observation.obsTimeUtc || observation.obsTimeLocal || "");
  if (!Number.isFinite(timestamp)) throw new Error("Observación Weather.com sin timestamp válido");
  const metric = observation.metric;
  const feelsLike = Number.isFinite(metric.windChill) ? metric.windChill : metric.heatIndex;
  return {
    observedAt: new Date(timestamp).toISOString(),
    temperature: metric.temp,
    feelsLike: finiteOrNull(feelsLike),
    humidity: finiteOrNull(observation.humidity),
    pressure: finiteOrNull(metric.pressure),
    windSpeed: finiteOrNull(metric.windSpeed),
    windGust: finiteOrNull(metric.windGust),
    windDirection: Number.isFinite(observation.winddir) ? DIRECTIONS[Math.round(observation.winddir / 22.5) % 16] : typeof observation.winddir === "string" ? observation.winddir : null,
    windDirectionDegrees: finiteOrNull(observation.winddir),
    precipRate: finiteOrNull(metric.precipRate),
    precipTotal: finiteOrNull(metric.precipTotal),
    dewPoint: finiteOrNull(metric.dewpt),
    weatherCondition: observation.wxPhraseMedium || observation.wxPhraseLong || observation.wxPhraseShort || null
  };
}

export async function fetchWeatherObservation(env) {
  if (!env.WEATHER_API_KEY) throw new Error("WEATHER_API_KEY no está configurado");
  const params = new URLSearchParams({ stationId: env.WEATHER_STATION_ID, format: "json", units: "m", numericPrecision: "decimal", apiKey: env.WEATHER_API_KEY });
  const response = await fetch(`${WEATHER_ENDPOINT}?${params.toString()}`);
  if (!response.ok) throw new Error(`Weather.com respondió ${response.status}`);
  return normalizeWeatherObservation(await response.json());
}
