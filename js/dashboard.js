const API_URL = "https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=1f02ece8a18244d482ece8a18284d480&numericPrecision=decimal";

const DIRECCIONES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

/** Devuelve la dirección cardinal correspondiente a una lectura en grados. */
function direccion(grados) {
  return Number.isFinite(grados) ? DIRECCIONES[Math.round(grados / 22.5) % 16] : "--";
}

/** Describe la condición predominante sin depender de recursos visuales externos. */
function estadoTiempo(obs) {
  const metric = obs.metric;
  if (metric.precipRate > 0) return { texto: "Lloviendo", icono: "fa-cloud-rain" };
  if (metric.windSpeed >= 30) return { texto: "Viento intenso", icono: "fa-wind" };
  if (metric.temp >= 32) return { texto: "Mucho calor", icono: "fa-sun" };
  if (metric.temp <= 5) return { texto: "Mucho frío", icono: "fa-snowflake" };
  return { texto: "Tiempo estable", icono: "fa-cloud-sun" };
}

function valor(id, contenido) { document.getElementById(id).textContent = contenido; }
function grados(valor) { return Number.isFinite(valor) ? `${valor}°` : "--"; }
function textoPorDefecto(valor, sufijo) { return valor === null || valor === undefined ? `--${sufijo}` : `${valor}${sufijo}`; }

/** Actualiza los valores visibles con la observación más reciente de la estación. */
function mostrarClima(obs) {
  const metric = obs.metric;
  const estado = estadoTiempo(obs);
  const sensacion = Number.isFinite(metric.windChill) ? metric.windChill : metric.heatIndex;

  document.querySelector(".temp").textContent = grados(metric.temp);
  document.querySelector(".status").textContent = estado.texto;
  document.getElementById("statusIcon").className = `fa-solid ${estado.icono}`;
  valor("heroST", grados(sensacion));
  valor("heroHumedad", textoPorDefecto(obs.humidity, "%"));
  valor("cTemp", grados(metric.temp));
  valor("cHumedad", textoPorDefecto(obs.humidity, "%"));
  valor("cViento", Number.isFinite(metric.windSpeed) ? `${metric.windSpeed} km/h` : "--");
  valor("cDireccion", direccion(obs.winddir));
  valor("cRafagas", Number.isFinite(metric.windGust) ? `${metric.windGust} km/h` : "--");
  valor("cLluvia", Number.isFinite(metric.precipTotal) ? `${metric.precipTotal} mm` : "--");
  valor("cST", grados(sensacion));
  valor("cPresion", Number.isFinite(metric.pressure) ? `${metric.pressure} hPa` : "--");
  valor("cSolar", Number.isFinite(obs.solarRadiation) ? `${obs.solarRadiation} W/m²` : "--");

  const fecha = new Date(obs.obsTimeLocal);
  valor("actualizacion", `Actualizado: ${fecha.toLocaleDateString("es-AR")} · ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`);
}

async function cargarClima() {
  try {
    const respuesta = await fetch(API_URL);
    if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
    const data = await respuesta.json();
    const obs = data.observations && data.observations[0];
    if (!obs || !obs.metric) throw new Error("La API no devolvió una observación válida");
    mostrarClima(obs);
  } catch (error) {
    console.error("No se pudo cargar el clima:", error);
    document.querySelector(".status").textContent = "Datos no disponibles";
    document.getElementById("statusIcon").className = "fa-solid fa-triangle-exclamation";
    valor("actualizacion", "No se pudo actualizar la información");
  }
}

cargarClima();
setInterval(cargarClima, 150000);
