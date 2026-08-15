const API_KEY = "1f02ece8a18244d482ece8a18284d480";
const API_URL = `https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=${API_KEY}&numericPrecision=decimal`;
const GEOCOORDENADAS = "-34.655,-58.667";
const METEORED_API_KEY = "588d0c77954be983ce8b369a5a0e41f10c8d52b790573a92e21ce0a8cc695edf";
const METEORED_HASH = "02fb9feb8e7f9462733d7279a5479236";
const METEORED_URL = "https://api.meteored.com/api/forecast/v1";
const METEORED_CACHE_PREFIX = "meteoituzaingo.meteored.v1.";
const DIRECCIONES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const MAP_INITIAL_ZOOM = 12;
const MAP_CENTER = [-34.655, -58.667];
const IMAGE_REFRESH_MS = 600000;
const radarProvider = { nombre: "ClimaSurGBA", url: "https://climasurgba.com.ar/radar/ezeiza0.png", intervalo: IMAGE_REFRESH_MS };
const satelliteProvider = { nombre: "CX2SA", url: "http://www.cx2sa.com/nr/satimg3.jpg", intervalo: IMAGE_REFRESH_MS };
let mapa;
let marcadorEstacion;
let ultimaObservacion;
let ultimaSensacion;

function direccion(grados) { return Number.isFinite(grados) ? DIRECCIONES[Math.round(grados / 22.5) % 16] : "--"; }
function valor(id, contenido) { document.getElementById(id).textContent = contenido; }
function grados(numero) { return Number.isFinite(numero) ? `${Math.round(numero)}°` : "--"; }
function textoPorDefecto(numero, sufijo) { return numero === null || numero === undefined ? `--${sufijo}` : `${numero}${sufijo}`; }

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
  ultimaObservacion = obs;
  ultimaSensacion = sensacion;
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

function mensajePronostico(id, mensaje) { document.getElementById(id).innerHTML = `<p class="forecast-message">${mensaje}</p>`; }
function fuentePronostico(id, disponible) {
  const fuente = document.getElementById(id);
  fuente.hidden = !disponible;
  fuente.textContent = disponible ? "Fuente: Weather.com" : "";
}

function iconoMeteored(simbolo) {
  if (simbolo >= 10 && simbolo <= 15) return "fa-cloud-rain";
  if (simbolo >= 16 && simbolo <= 18) return "fa-cloud-bolt";
  if (simbolo >= 7 && simbolo <= 9) return "fa-cloud";
  if (simbolo >= 3 && simbolo <= 6) return "fa-cloud-sun";
  return "fa-sun";
}

function fechaMeteored(timestamp, opciones) { return new Date(timestamp).toLocaleString("es-AR", opciones); }

/** Renderiza las siguientes 12 horas usando exclusivamente la respuesta real de Meteored. */
function renderizarHorario(data) {
  const contenedor = document.getElementById("hourlyForecast"); const horas = data.hours || [];
  contenedor.innerHTML = "";
  horas.slice(0, 12).forEach(function (horaData) {
    const tarjeta = document.createElement("article"); const hora = fechaMeteored(horaData.end, { hour: "2-digit", minute: "2-digit" });
    tarjeta.className = "hour-card";
    tarjeta.innerHTML = `<time datetime="${new Date(horaData.end).toISOString()}">${hora}</time><i class="fa-solid ${iconoMeteored(horaData.symbol)}" aria-hidden="true"></i><strong>${grados(horaData.temperature)}</strong><span class="hour-feels">Sensación ${grados(horaData.temperature_feels_like)}</span><span class="hour-details"><span><i class="fa-solid fa-droplet" aria-hidden="true"></i>${textoPorDefecto(horaData.rain_probability, "%")}</span><span><i class="fa-solid fa-water" aria-hidden="true"></i>${textoPorDefecto(horaData.humidity, "%")}</span><span><i class="fa-solid fa-wind" aria-hidden="true"></i>${textoPorDefecto(horaData.wind_speed, " km/h")} ${horaData.wind_direction || ""}</span></span>`;
    contenedor.appendChild(tarjeta);
  });
  if (!horas.length) { mensajePronostico("hourlyForecast", "Meteored no devolvió horas de pronóstico para esta ubicación."); fuentePronostico("hourlySource", false); } else { fuentePronostico("hourlySource", true); document.getElementById("hourlySource").textContent = "Fuente: Meteored"; }
}

/** Renderiza el pronóstico extendido real de Meteored sin sustituir valores ausentes. */
function renderizarDiario(data) {
  const contenedor = document.getElementById("dailyForecast"); const dias = data.days || [];
  contenedor.innerHTML = "";
  dias.slice(0, 5).forEach(function (dia) {
    const tarjeta = document.createElement("article"); const fecha = fechaMeteored(dia.start, { weekday: "short", day: "numeric" });
    tarjeta.className = "day-card";
    tarjeta.innerHTML = `<time>${fecha}</time><span class="day-condition"><i class="fa-solid ${iconoMeteored(dia.symbol)}" aria-hidden="true"></i><span>Pronóstico Meteored</span></span><span><span class="day-temperatures"><span>${grados(dia.temperature_min)}</span><strong>${grados(dia.temperature_max)}</strong></span><span class="rain-chance"><i class="fa-solid fa-droplet" aria-hidden="true"></i>${textoPorDefecto(dia.rain_probability, "%")} · <i class="fa-solid fa-wind" aria-hidden="true"></i>${textoPorDefecto(dia.wind_speed, " km/h")}</span></span>`;
    contenedor.appendChild(tarjeta);
  });
  if (!dias.length) { mensajePronostico("dailyForecast", "Meteored no devolvió días de pronóstico para esta ubicación."); fuentePronostico("dailySource", false); } else { fuentePronostico("dailySource", true); document.getElementById("dailySource").textContent = "Fuente: Meteored"; }
}

function leerCacheMeteored(tipo) {
  try { return JSON.parse(localStorage.getItem(`${METEORED_CACHE_PREFIX}${tipo}`)); } catch (error) { return null; }
}

function guardarCacheMeteored(tipo, respuesta) {
  try { localStorage.setItem(`${METEORED_CACHE_PREFIX}${tipo}`, JSON.stringify(respuesta)); } catch (error) { console.warn("No se pudo guardar la caché de Meteored", error); }
}

async function obtenerPronosticoMeteored(tipo) {
  const cache = leerCacheMeteored(tipo);
  if (cache && cache.expiracion > Date.now() && cache.data) return cache.data;
  const respuesta = await fetch(`${METEORED_URL}/${tipo}/${METEORED_HASH}`, { headers: { "X-API-Key": METEORED_API_KEY, Accept: "application/json" }, cache: "no-store" });
  if (!respuesta.ok) throw new Error(`Meteored respondió ${respuesta.status}`);
  const cuerpo = await respuesta.json();
  if (!cuerpo.ok || !cuerpo.data || !Number.isFinite(cuerpo.expiracion)) throw new Error("Meteored devolvió una respuesta inválida");
  guardarCacheMeteored(tipo, cuerpo);
  return cuerpo.data;
}

/** Consulta Meteored solo cuando su expiración haya vencido; no usa polling. */
async function cargarPronosticos() {
  try { renderizarHorario(await obtenerPronosticoMeteored("hourly")); } catch (error) { console.error("No se pudo cargar el pronóstico horario:", error); mensajePronostico("hourlyForecast", "No se pudo actualizar el pronóstico horario de Meteored."); fuentePronostico("hourlySource", false); }
  try { renderizarDiario(await obtenerPronosticoMeteored("daily")); } catch (error) { console.error("No se pudo cargar el pronóstico extendido:", error); mensajePronostico("dailyForecast", "No se pudo actualizar el pronóstico extendido de Meteored."); fuentePronostico("dailySource", false); }
}

/** Crea el mapa de ubicación y corrige el tamaño al mostrarse en Blogger o GitHub Pages. */
function iniciarMapa() {
  const contenedor = document.getElementById("weatherMap");
  if (!window.L || !contenedor || mapa) return;
  mapa = window.L.map(contenedor, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, minZoom: 3, maxZoom: 19 }).setView(MAP_CENTER, MAP_INITIAL_ZOOM);
  const base = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, minZoom: 3, keepBuffer: 3, updateWhenIdle: false, attribution: "© OpenStreetMap contributors" });
  base.addTo(mapa);
  const iconoEstacion = window.L.divIcon({ className: "station-marker", html: '<i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i>', iconSize: [38, 38], iconAnchor: [19, 19] });
  marcadorEstacion = window.L.marker(MAP_CENTER, { icon: iconoEstacion, title: "Estación Meteo Ituzaingó", keyboard: true }).addTo(mapa);
  const ControlCentrar = window.L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
      const boton = window.L.DomUtil.create("button", "map-recenter");
      boton.type = "button"; boton.title = "Volver a Ituzaingó"; boton.setAttribute("aria-label", "Volver a Ituzaingó");
      boton.innerHTML = '<i class="fa-solid fa-crosshairs" aria-hidden="true"></i><span>Volver</span>';
      window.L.DomEvent.disableClickPropagation(boton); window.L.DomEvent.on(boton, "click", function () { mapa.setView(MAP_CENTER, MAP_INITIAL_ZOOM, { animate: true }); });
      return boton;
    }
  });
  mapa.addControl(new ControlCentrar());
  const ajustarMapa = function () { mapa.invalidateSize({ animate: false, pan: false }); };
  window.requestAnimationFrame(ajustarMapa);
  window.addEventListener("resize", ajustarMapa, { passive: true });
  window.addEventListener("orientationchange", ajustarMapa, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(ajustarMapa).observe(contenedor);
  if (ultimaObservacion) actualizarMapa(ultimaObservacion, ultimaSensacion);
}

function horaActualizacion() { return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); }

/** Actualiza solo una imagen externa y evita caché obsoleta sin recargar el dashboard. */
function actualizarImagen(provider, imageId, metaId) {
  const imagen = document.getElementById(imageId);
  const meta = document.getElementById(metaId);
  if (!imagen || !meta) return;
  imagen.onload = function () { meta.textContent = `Fuente provisional: ${provider.nombre}. Recurso actualizado a las ${horaActualizacion()}.`; };
  imagen.onerror = function () { meta.textContent = `Imagen de ${provider.nombre} no disponible. Se reintentará automáticamente.`; };
  imagen.src = `${provider.url}?t=${Date.now()}`;
}

function iniciarImagenesExternas() {
  actualizarImagen(radarProvider, "radarImage", "radarMeta");
  document.getElementById("refreshRadar").addEventListener("click", function () { actualizarImagen(radarProvider, "radarImage", "radarMeta"); });
  setInterval(function () { actualizarImagen(radarProvider, "radarImage", "radarMeta"); }, radarProvider.intervalo);

  if (window.location.protocol === "http:") {
    document.getElementById("satelliteImage").hidden = false;
    document.getElementById("satellitePlaceholder").hidden = true;
    document.getElementById("refreshSatellite").disabled = false;
    document.getElementById("refreshSatellite").addEventListener("click", function () { actualizarImagen(satelliteProvider, "satelliteImage", "satelliteMeta"); });
    actualizarImagen(satelliteProvider, "satelliteImage", "satelliteMeta");
    setInterval(function () { actualizarImagen(satelliteProvider, "satelliteImage", "satelliteMeta"); }, satelliteProvider.intervalo);
  }
}

/** Mantiene el resumen del popup sincronizado con la última observación local. */
function actualizarMapa(obs, sensacion) {
  if (!marcadorEstacion) return;
  const metric = obs.metric;
  const fecha = new Date(obs.obsTimeLocal);
  const actualizacion = Number.isNaN(fecha.getTime()) ? "No disponible" : fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  marcadorEstacion.bindPopup(`<div class="station-popup"><strong>Meteo Ituzaingó</strong><span>Estación meteorológica local</span><span>Temperatura: ${grados(metric.temp)} · Sensación: ${grados(sensacion)}</span><span>Humedad: ${textoPorDefecto(obs.humidity, "%")} · Viento: ${textoPorDefecto(metric.windSpeed, " km/h")}</span><span>Actualizado: ${actualizacion}</span></div>`, { maxWidth: 250 });
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

cargarClima(); cargarPronosticos(); iniciarMapa(); iniciarImagenesExternas();
setInterval(cargarClima, 150000);
