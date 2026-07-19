const API_KEY = "1f02ece8a18244d482ece8a18284d480";
const API_URL = `https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=${API_KEY}&numericPrecision=decimal`;
const GEOCOORDENADAS = "-34.655,-58.667";
const FORECAST_URL = "https://api.weather.com/v3/wx/forecast";
const DIRECCIONES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
let ultimaCargaPronostico = 0;
let mapa;
let marcadorEstacion;

function direccion(grados) { return Number.isFinite(grados) ? DIRECCIONES[Math.round(grados / 22.5) % 16] : "--"; }
function valor(id, contenido) { document.getElementById(id).textContent = contenido; }
function grados(numero) { return Number.isFinite(numero) ? `${Math.round(numero)}°` : "--"; }
function textoPorDefecto(numero, sufijo) { return numero === null || numero === undefined ? `--${sufijo}` : `${numero}${sufijo}`; }
function valorHorario(valores, indice, sufijo) { return Number.isFinite(valores[indice]) ? `${Math.round(valores[indice])}${sufijo}` : "--"; }

/** Calcula el punto de rocío en °C mediante la aproximación de Magnus. */
function puntoDeRocio(temperatura, humedad) {
  if (!Number.isFinite(temperatura) || !Number.isFinite(humedad) || humedad <= 0) return null;
  const a = 17.62;
  const b = 243.12;
  const gamma = (a * temperatura) / (b + temperatura) + Math.log(humedad / 100);
  return (b * gamma) / (a - gamma);
}

function iconoClima(frase) {
  const texto = (frase || "").toLowerCase();
  if (/torment|thunder/.test(texto)) return "fa-cloud-bolt";
  if (/lloviz|drizzle/.test(texto)) return "fa-cloud-rain";
  if (/lluv|rain|shower/.test(texto)) return "fa-cloud-showers-heavy";
  if (/niebla|fog|neblina|haze|bruma/.test(texto)) return "fa-smog";
  if (/viento|wind/.test(texto)) return "fa-wind";
  if (/cubierto|overcast|nublado|cloud/.test(texto)) return "fa-cloud";
  if (/parcial|mayormente|partly|mostly/.test(texto)) return "fa-cloud-sun";
  return "fa-sun";
}

/** Traduce las frases frecuentes de Weather.com para conservar la interfaz en español. */
function normalizarFrase(frase) {
  const texto = (frase || "").toLowerCase();
  const equivalencias = [[/thunder/, "Tormentas"], [/drizzle/, "Llovizna"], [/rain|shower/, "Lluvia"], [/fog/, "Niebla"], [/haze/, "Neblina"], [/wind/, "Ventoso"], [/overcast/, "Cubierto"], [/mostly cloudy/, "Mayormente nublado"], [/partly cloudy/, "Parcialmente nublado"], [/cloudy/, "Nublado"], [/mostly sunny|mostly clear/, "Mayormente soleado"], [/sunny|clear|fair/, "Soleado"]];
  for (let i = 0; i < equivalencias.length; i += 1) if (equivalencias[i][0].test(texto)) return equivalencias[i][1];
  return frase || "";
}

/** Determina una condición profesional cuando la estación no incluye una frase meteorológica. */
function estadoDeRespaldo(metric, humedad) {
  if (metric.precipRate > 2) return "Lluvia";
  if (metric.precipRate > 0) return "Llovizna";
  if (metric.windSpeed >= 35) return "Ventoso";
  if (humedad >= 96 && metric.windSpeed < 8) return "Niebla";
  if (humedad >= 88) return "Neblina";
  if (humedad >= 80) return "Cubierto";
  if (humedad >= 68) return "Nublado";
  if (humedad >= 58) return "Mayormente nublado";
  if (humedad >= 45) return "Parcialmente nublado";
  if (humedad >= 35) return "Mayormente soleado";
  return "Soleado";
}

function estadoTiempo(obs) {
  const fraseApi = obs.wxPhraseMedium || obs.wxPhraseLong || obs.wxPhraseShort;
  const texto = normalizarFrase(fraseApi) || estadoDeRespaldo(obs.metric, obs.humidity);
  return { texto: texto, icono: iconoClima(texto) };
}

/** Actualiza las condiciones medidas por la estación meteorológica propia. */
function mostrarClima(obs) {
  const metric = obs.metric;
  const estado = estadoTiempo(obs);
  const sensacion = Number.isFinite(metric.windChill) ? metric.windChill : metric.heatIndex;
  const rocio = Number.isFinite(metric.dewpt) ? metric.dewpt : puntoDeRocio(metric.temp, obs.humidity);
  document.querySelector(".temp").textContent = grados(metric.temp);
  document.querySelector(".status").textContent = estado.texto;
  document.getElementById("statusIcon").className = `fa-solid ${estado.icono}`;
  valor("heroST", grados(sensacion)); valor("heroHumedad", textoPorDefecto(obs.humidity, "%"));
  valor("cTemp", grados(metric.temp)); valor("cHumedad", textoPorDefecto(obs.humidity, "%"));
  valor("cViento", Number.isFinite(metric.windSpeed) ? `${metric.windSpeed} km/h` : "--");
  valor("cDireccion", direccion(obs.winddir)); valor("cRafagas", Number.isFinite(metric.windGust) ? `${metric.windGust} km/h` : "--");
  valor("cLluvia", Number.isFinite(metric.precipTotal) ? `${metric.precipTotal} mm` : "--");
  valor("cST", grados(sensacion)); valor("cPresion", Number.isFinite(metric.pressure) ? `${metric.pressure} hPa` : "--");
  valor("cRocio", grados(rocio));
  actualizarMapa(obs, sensacion);
  const fecha = new Date(obs.obsTimeLocal);
  valor("actualizacion", `Actualizado: ${fecha.toLocaleDateString("es-AR")} · ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`);
}

function urlPronostico(tipo, duracion) { return `${FORECAST_URL}/${tipo}/${duracion}?geocode=${GEOCOORDENADAS}&units=m&language=es-AR&format=json&apiKey=${API_KEY}`; }
function mensajePronostico(id) { document.getElementById(id).innerHTML = '<p class="forecast-message">El pronóstico de Weather.com no está disponible con la autorización actual de la API.</p>'; }
function fuentePronostico(id, disponible) {
  const fuente = document.getElementById(id);
  fuente.hidden = !disponible;
  fuente.textContent = disponible ? "Fuente: Weather.com" : "";
}

function renderizarHorario(data) {
  const contenedor = document.getElementById("hourlyForecast"); const horas = data.validTimeLocal || []; const temperaturas = data.temperature || []; const frases = data.wxPhraseMedium || data.wxPhraseLong || [];
  const probabilidades = data.precipChance || data.precipitationProbability || []; const vientos = data.windSpeed || [];
  contenedor.innerHTML = "";
  horas.slice(0, 12).forEach(function (fecha, indice) {
    const tarjeta = document.createElement("article"); const hora = new Date(fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); const frase = normalizarFrase(frases[indice]) || "Condiciones variables";
    tarjeta.className = "hour-card";
    tarjeta.innerHTML = `<time datetime="${fecha}">${hora}</time><i class="fa-solid ${iconoClima(frase)}" aria-hidden="true"></i><strong>${grados(temperaturas[indice])}</strong><span>${frase}</span><span class="hour-details"><span><i class="fa-solid fa-droplet" aria-hidden="true"></i>${valorHorario(probabilidades, indice, "%")}</span><span><i class="fa-solid fa-wind" aria-hidden="true"></i>${valorHorario(vientos, indice, " km/h")}</span></span>`;
    contenedor.appendChild(tarjeta);
  });
  if (!horas.length) { mensajePronostico("hourlyForecast"); fuentePronostico("hourlySource", false); } else fuentePronostico("hourlySource", true);
}

function renderizarDiario(data) {
  const contenedor = document.getElementById("dailyForecast"); const dias = data.dayOfWeek || []; const maximas = data.calendarDayTemperatureMax || data.temperatureMax || []; const minimas = data.calendarDayTemperatureMin || data.temperatureMin || [];
  const partes = data.daypart && data.daypart[0] ? data.daypart[0] : {}; const frases = partes.wxPhraseLong || data.wxPhraseLong || []; const probabilidades = partes.precipChance || data.precipChance || data.precipitationProbabilityMax || [];
  contenedor.innerHTML = "";
  dias.slice(0, 5).forEach(function (dia, indice) {
    const frase = normalizarFrase(frases[indice * 2] || frases[indice]) || "Condiciones variables"; const tarjeta = document.createElement("article");
    tarjeta.className = "day-card";
    const probabilidad = valorHorario(probabilidades, probabilidades.length > dias.length ? indice * 2 : indice, "%");
    tarjeta.innerHTML = `<time>${dia}</time><span class="day-condition"><i class="fa-solid ${iconoClima(frase)}" aria-hidden="true"></i>${frase}</span><span><span class="day-temperatures"><span>${grados(minimas[indice])}</span><strong>${grados(maximas[indice])}</strong></span><span class="rain-chance"><i class="fa-solid fa-droplet" aria-hidden="true"></i>${probabilidad}</span></span>`;
    contenedor.appendChild(tarjeta);
  });
  if (!dias.length) { mensajePronostico("dailyForecast"); fuentePronostico("dailySource", false); } else fuentePronostico("dailySource", true);
}

/** Carga pronósticos oficiales únicamente cuando la licencia autoriza sus endpoints. */
async function cargarPronosticos() {
  if (Date.now() - ultimaCargaPronostico < 1800000) return;
  ultimaCargaPronostico = Date.now();
  const obtenerJson = function (url) {
    return fetch(url).then(function (respuesta) { return respuesta.ok ? respuesta.json() : null; }).catch(function () { return null; });
  };
  const resultados = await Promise.all([obtenerJson(urlPronostico("hourly", "1day")), obtenerJson(urlPronostico("daily", "5day"))]);
  if (resultados[0]) renderizarHorario(resultados[0]); else { mensajePronostico("hourlyForecast"); fuentePronostico("hourlySource", false); }
  if (resultados[1]) renderizarDiario(resultados[1]); else { mensajePronostico("dailyForecast"); fuentePronostico("dailySource", false); }
}

function iniciarMapa() {
  if (!window.L) return;
  mapa = window.L.map("weatherMap", { scrollWheelZoom: false }).setView([-34.655, -58.667], 12);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
  const iconoEstacion = window.L.divIcon({ className: "station-marker", html: '<i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i>', iconSize: [38, 38], iconAnchor: [19, 19] });
  marcadorEstacion = window.L.marker([-34.655, -58.667], { icon: iconoEstacion, title: "Estación Meteo Ituzaingó" }).addTo(mapa).bindPopup("Meteo Ituzaingó");
  const ControlCentrar = window.L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
      const boton = window.L.DomUtil.create("button", "map-recenter");
      boton.type = "button"; boton.title = "Centrar en la estación"; boton.setAttribute("aria-label", "Centrar en la estación");
      boton.innerHTML = '<i class="fa-solid fa-crosshairs" aria-hidden="true"></i>';
      window.L.DomEvent.disableClickPropagation(boton); window.L.DomEvent.on(boton, "click", function () { mapa.setView([-34.655, -58.667], 12); });
      return boton;
    }
  });
  mapa.addControl(new ControlCentrar());
}

/** Mantiene el resumen del popup sincronizado con la última observación local. */
function actualizarMapa(obs, sensacion) {
  if (!marcadorEstacion) return;
  const metric = obs.metric;
  marcadorEstacion.bindPopup(`<strong>Meteo Ituzaingó</strong><br>Temperatura: ${grados(metric.temp)}<br>Sensación: ${grados(sensacion)}<br>Humedad: ${textoPorDefecto(obs.humidity, "%")}<br>Viento: ${textoPorDefecto(metric.windSpeed, " km/h")}`);
}

async function cargarClima() {
  try {
    const respuesta = await fetch(API_URL); if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
    const data = await respuesta.json(); const obs = data.observations && data.observations[0];
    if (!obs || !obs.metric) throw new Error("La API no devolvió una observación válida");
    mostrarClima(obs);
  } catch (error) {
    console.error("No se pudo cargar el clima:", error);
    document.querySelector(".status").textContent = "Datos no disponibles";
    document.getElementById("statusIcon").className = "fa-solid fa-triangle-exclamation";
    valor("actualizacion", "No se pudo actualizar la información");
  }
}

cargarClima(); cargarPronosticos(); iniciarMapa();
setInterval(cargarClima, 150000); setInterval(cargarPronosticos, 1800000);
