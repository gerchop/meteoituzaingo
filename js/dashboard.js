const API_KEY = "1f02ece8a18244d482ece8a18284d480";
const API_URL = `https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=${API_KEY}&numericPrecision=decimal`;
const GEOCOORDENADAS = "-34.655,-58.667";
const METEORED_API_KEY = "588d0c77954be983ce8b369a5a0e41f10c8d52b790573a92e21ce0a8cc695edf";
const METEORED_HASH = "02fb9feb8e7f9462733d7279a5479236";
const METEORED_URL = "https://api.meteored.com/api/forecast/v1";
const METEORED_CACHE_PREFIX = "meteoituzaingo.meteored.v1.";
const DIRECCIONES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const CONFIG = {
  observacionesMs: 150000,
  radarMs: 600000,
  sateliteMs: 1800000,
  cuadroSateliteMs: 500,
  historialMaximo: 96,
  historialDuracionMs: 86400000,
  tendenciaMinutos: [60, 30],
  tendenciaToleranciaMs: 900000,
  temperaturaEstable: 0.3,
  presionEstable: 0.5,
  vientoEstable: 3,
  vientoFuerte: 35,
  rafagaFuerte: 45,
  temperaturaAlta: 35,
  temperaturaBaja: 2,
  humedadElevada: 90,
  lluviaDebilMax: 2.5,
  lluviaModeradaMax: 7.6,
  lluviaFuerte: 7.6,
  presionDescensoDestacado: -2
};
const LOCAL_HISTORY_KEY = "meteoituzaingo.observaciones.local.v1";
const radarProvider = { nombre: "ClimaSurGBA", url: "https://climasurgba.com.ar/radar/ezeiza0.png", intervalo: CONFIG.radarMs };
const CONAE_ANIMATION_URL = "https://catalogos4.conae.gov.ar/goesr_l2/animaciones/recuperarListaImagenes.aspx";
const CONAE_BASE_URL = "https://catalogos4.conae.gov.ar/goesr_l2/animaciones/";
const CONAE_PRODUCTS = { ArgIrol: "Infrarrojo de onda larga", ArgVisb2: "Visible Banda 2", ArgRgbmn: "RGB Microfísica nocturna", ArgVanm: "Niveles medios de vapor de agua" };
const METEORED_SIMBOLOS = {
  1: ["Despejado", "fa-sun"], 2: ["Nubes altas", "fa-cloud-sun"], 3: ["Nubes y claros", "fa-cloud-sun"], 4: ["Parcialmente nublado", "fa-cloud-sun"], 5: ["Cubierto", "fa-cloud"],
  6: ["Calima", "fa-smog"], 7: ["Calima", "fa-smog"], 8: ["Neblina", "fa-smog"], 9: ["Niebla", "fa-smog"], 10: ["Tormenta seca", "fa-cloud-bolt"], 11: ["Tormenta seca", "fa-cloud-bolt"],
  12: ["Lluvia débil", "fa-cloud-rain"], 13: ["Lluvia débil", "fa-cloud-rain"], 14: ["Lluvia", "fa-cloud-showers-heavy"], 15: ["Lluvia", "fa-cloud-showers-heavy"], 16: ["Lluvia", "fa-cloud-rain"], 17: ["Lluvia", "fa-cloud-rain"],
  18: ["Lluvia engelante", "fa-cloud-rain"], 19: ["Lluvia engelante", "fa-cloud-rain"], 20: ["Aguanieve", "fa-cloud-rain"], 21: ["Aguanieve", "fa-cloud-rain"], 22: ["Aguanieve", "fa-cloud-rain"], 23: ["Aguanieve", "fa-cloud-rain"],
  24: ["Nieve", "fa-snowflake"], 25: ["Nieve", "fa-snowflake"], 26: ["Nieve", "fa-snowflake"], 27: ["Nieve", "fa-snowflake"], 28: ["Lluvia fuerte", "fa-cloud-showers-heavy"], 29: ["Lluvia fuerte", "fa-cloud-showers-heavy"],
  30: ["Lluvia y nieve", "fa-cloud-rain"], 31: ["Lluvia y nieve", "fa-cloud-rain"], 32: ["Nevada intensa", "fa-snowflake"], 33: ["Nevada intensa", "fa-snowflake"], 34: ["Tormentas", "fa-cloud-bolt"], 35: ["Tormentas", "fa-cloud-bolt"],
  36: ["Granizo", "fa-cloud-bolt"], 37: ["Granizo", "fa-cloud-bolt"], 38: ["Tormentas con granizo", "fa-cloud-bolt"], 39: ["Tormentas con granizo", "fa-cloud-bolt"], 40: ["Tormenta de arena", "fa-wind"], 41: ["Ventisca", "fa-wind"]
};
let satelite = { imagenes: [], indice: 0, reproduciendo: true, temporizador: null };

function direccion(grados) { return Number.isFinite(grados) ? DIRECCIONES[Math.round(grados / 22.5) % 16] : "--"; }
function valor(id, contenido) { document.getElementById(id).textContent = contenido; }
function grados(numero) { return Number.isFinite(numero) ? `${Math.round(numero)}°` : "--"; }
function textoPorDefecto(numero, sufijo) { return numero === null || numero === undefined ? `--${sufijo}` : `${numero}${sufijo}`; }
function numeroValido(numero) { return Number.isFinite(numero); }

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

/** Fórmulas locales: se muestran únicamente dentro de sus rangos meteorológicos de aplicación. */
function indiceCalor(temperatura, humedad) {
  if (!numeroValido(temperatura) || !numeroValido(humedad) || temperatura < 26.7 || humedad < 40) return null;
  const fahrenheit = (temperatura * 9) / 5 + 32;
  const indiceF = -42.379 + 2.04901523 * fahrenheit + 10.14333127 * humedad - 0.22475541 * fahrenheit * humedad - 0.00683783 * fahrenheit ** 2 - 0.05481717 * humedad ** 2 + 0.00122874 * fahrenheit ** 2 * humedad + 0.00085282 * fahrenheit * humedad ** 2 - 0.00000199 * fahrenheit ** 2 * humedad ** 2;
  return (indiceF - 32) * 5 / 9;
}

function calcularWindChill(temperatura, viento) {
  if (!numeroValido(temperatura) || !numeroValido(viento) || temperatura > 10 || viento <= 4.8) return null;
  return 13.12 + 0.6215 * temperatura - 11.37 * viento ** 0.16 + 0.3965 * temperatura * viento ** 0.16;
}

function humidex(temperatura, rocio) {
  if (!numeroValido(temperatura) || !numeroValido(rocio)) return null;
  const vapor = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + rocio)));
  return temperatura + (5 / 9) * (vapor - 10);
}

function clasificarConfort(temperatura, humedad, indice, enfriamiento) {
  if (numeroValido(indice) && indice >= 38) return "Muy caluroso";
  if (numeroValido(indice) && indice >= 30) return "Caluroso";
  if (numeroValido(enfriamiento) && enfriamiento <= 0) return "Frío";
  if (numeroValido(temperatura) && temperatura <= 5) return "Frío";
  if (numeroValido(temperatura) && temperatura <= 12) return "Fresco";
  if (numeroValido(humedad) && humedad >= 85) return "Muy húmedo";
  if (numeroValido(humedad) && humedad >= 70) return "Húmedo";
  if (numeroValido(humedad) && humedad >= 60) return "Algo húmedo";
  return "Confortable";
}

function intensidadLluvia(tasa) {
  if (!numeroValido(tasa) || tasa <= 0) return "Sin lluvia en curso";
  if (tasa <= CONFIG.lluviaDebilMax) return "Lluvia en curso · Débil";
  if (tasa <= CONFIG.lluviaModeradaMax) return "Lluvia en curso · Moderada";
  return "Lluvia en curso · Fuerte";
}

function leerHistorialLocal() {
  try {
    const historial = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY));
    return Array.isArray(historial) ? historial.filter(function (muestra) { return muestra && numeroValido(muestra.timestamp); }) : [];
  } catch (error) { return []; }
}

function guardarObservacionLocal(obs) {
  const metric = obs.metric;
  const timestamp = Date.parse(obs.obsTimeLocal || obs.obsTimeUtc || "");
  if (!numeroValido(timestamp)) return leerHistorialLocal();
  const muestra = { timestamp: timestamp, temperatura: metric.temp, presion: metric.pressure, humedad: obs.humidity, viento: metric.windSpeed, rafaga: metric.windGust, precipitacion: metric.precipTotal, intensidad: metric.precipRate };
  const limite = Date.now() - CONFIG.historialDuracionMs;
  const historial = leerHistorialLocal().filter(function (item) { return item.timestamp >= limite; });
  if (!historial.length || historial[historial.length - 1].timestamp !== muestra.timestamp) historial.push(muestra);
  const recortado = historial.slice(-CONFIG.historialMaximo);
  try { localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(recortado)); } catch (error) { console.warn("No se pudo guardar el registro local", error); }
  return recortado;
}

function calcularTendencia(historial, campo, actual, umbral) {
  if (!numeroValido(actual) || historial.length < 2) return null;
  const ahora = historial[historial.length - 1].timestamp;
  for (let i = 0; i < CONFIG.tendenciaMinutos.length; i += 1) {
    const minutos = CONFIG.tendenciaMinutos[i]; const objetivo = ahora - minutos * 60000;
    const candidatos = historial.filter(function (muestra) { return numeroValido(muestra[campo]) && Math.abs(muestra.timestamp - objetivo) <= CONFIG.tendenciaToleranciaMs; });
    if (!candidatos.length) continue;
    const previo = candidatos.reduce(function (mejor, muestra) { return Math.abs(muestra.timestamp - objetivo) < Math.abs(mejor.timestamp - objetivo) ? muestra : mejor; });
    const variacion = actual - previo[campo];
    return { variacion: variacion, minutos: minutos, direccion: variacion > umbral ? "subiendo" : variacion < -umbral ? "bajando" : "estable" };
  }
  return null;
}

function textoTendencia(nombre, tendencia, unidad) {
  if (!tendencia) return `${nombre}: recopilando datos`;
  const flecha = tendencia.direccion === "subiendo" ? "↑" : tendencia.direccion === "bajando" ? "↓" : "→";
  const variacion = tendencia.direccion === "estable" ? "estable" : `${tendencia.variacion > 0 ? "+" : ""}${tendencia.variacion.toFixed(1)} ${unidad}`;
  return `${nombre} ${flecha} ${variacion} / ${tendencia.minutos} min`;
}

function actualizarTendenciasYRegistros(obs, historial) {
  const metric = obs.metric;
  const temperatura = calcularTendencia(historial, "temperatura", metric.temp, CONFIG.temperaturaEstable);
  const presion = calcularTendencia(historial, "presion", metric.pressure, CONFIG.presionEstable);
  const viento = calcularTendencia(historial, "viento", metric.windSpeed, CONFIG.vientoEstable);
  document.getElementById("heroTrends").innerHTML = `<span>${textoTendencia("Temperatura", temperatura, "°C")}</span><span>${textoTendencia("Presión", presion, "hPa")}</span><span>${textoTendencia("Viento", viento, "km/h")}</span>`;
  mostrarRegistrosRecientes(historial);
  mostrarCondicionesDestacadas(obs, presion);
}

function mostrarRegistrosRecientes(historial) {
  const seccion = document.getElementById("recentRecordsSection"); const contenedor = document.getElementById("recentRecords");
  if (historial.length < 2) { seccion.hidden = true; return; }
  const valores = function (campo) { return historial.map(function (muestra) { return muestra[campo]; }).filter(numeroValido); };
  const campos = ["temperatura", "rafaga", "humedad", "presion"];
  if (campos.some(function (campo) { return valores(campo).length < 2; })) { seccion.hidden = true; return; }
  const maximo = function (campo) { return Math.max.apply(null, valores(campo)); };
  const minimo = function (campo) { return Math.min.apply(null, valores(campo)); };
  const datos = [["Temperatura máxima", grados(maximo("temperatura"))], ["Temperatura mínima", grados(minimo("temperatura"))], ["Ráfaga máxima", `${Math.round(maximo("rafaga"))} km/h`], ["Humedad máxima", `${Math.round(maximo("humedad"))}%`], ["Humedad mínima", `${Math.round(minimo("humedad"))}%`], ["Presión máxima", `${Math.round(maximo("presion"))} hPa`], ["Presión mínima", `${Math.round(minimo("presion"))} hPa`]];
  contenedor.innerHTML = datos.map(function (dato) { return `<article class="record-item"><span>${dato[0]}</span><strong>${dato[1]}</strong></article>`; }).join("");
  seccion.hidden = false;
}

function mostrarCondicionesDestacadas(obs, tendenciaPresion) {
  const metric = obs.metric; const condiciones = [];
  if (numeroValido(metric.precipRate) && metric.precipRate > CONFIG.lluviaFuerte) condiciones.push(["fa-cloud-showers-heavy", "Lluvia intensa", `${metric.precipRate} mm/h registrados`]);
  if (numeroValido(metric.windGust) && metric.windGust >= CONFIG.rafagaFuerte) condiciones.push(["fa-wind", "Ráfagas fuertes", `${metric.windGust} km/h registrados`]);
  if (numeroValido(metric.windSpeed) && metric.windSpeed >= CONFIG.vientoFuerte) condiciones.push(["fa-wind", "Viento fuerte", `${metric.windSpeed} km/h registrados`]);
  if (numeroValido(metric.temp) && metric.temp >= CONFIG.temperaturaAlta) condiciones.push(["fa-temperature-arrow-up", "Temperatura elevada", `${grados(metric.temp)} registrados`]);
  if (numeroValido(metric.temp) && metric.temp <= CONFIG.temperaturaBaja) condiciones.push(["fa-temperature-arrow-down", "Temperatura baja", `${grados(metric.temp)} registrados`]);
  if (numeroValido(obs.humidity) && obs.humidity >= CONFIG.humedadElevada) condiciones.push(["fa-droplet", "Humedad elevada", `${obs.humidity}% registrados`]);
  if (tendenciaPresion && tendenciaPresion.variacion <= CONFIG.presionDescensoDestacado) condiciones.push(["fa-arrow-trend-down", "Presión descendiendo", `${tendenciaPresion.variacion.toFixed(1)} hPa / ${tendenciaPresion.minutos} min`]);
  const seccion = document.getElementById("highlightSection");
  if (!condiciones.length) { seccion.hidden = true; return; }
  document.getElementById("highlightList").innerHTML = condiciones.map(function (condicion) { return `<article class="highlight-item"><i class="fa-solid ${condicion[0]}" aria-hidden="true"></i><strong>${condicion[1]}</strong><span>${condicion[2]}</span></article>`; }).join("");
  seccion.hidden = false;
}

/** Actualiza las condiciones medidas por la estación meteorológica propia. */
function mostrarClima(obs) {
  const metric = obs.metric;
  const estado = estadoTiempo(obs);
  const rocio = Number.isFinite(metric.dewpt) ? metric.dewpt : puntoDeRocio(metric.temp, obs.humidity);
  const calor = indiceCalor(metric.temp, obs.humidity);
  const enfriamiento = Number.isFinite(metric.windChill) ? metric.windChill : calcularWindChill(metric.temp, metric.windSpeed);
  const sensacion = Number.isFinite(metric.windChill) ? metric.windChill : Number.isFinite(metric.heatIndex) ? metric.heatIndex : Number.isFinite(calor) ? calor : metric.temp;
  const indiceHumidex = humidex(metric.temp, rocio);
  const confort = clasificarConfort(metric.temp, obs.humidity, calor, enfriamiento);
  document.querySelector(".temp").textContent = grados(metric.temp);
  document.querySelector(".status").textContent = estado.texto;
  document.getElementById("statusIcon").className = `fa-solid ${estado.icono}`;
  valor("heroST", grados(sensacion)); valor("heroHumedad", textoPorDefecto(obs.humidity, "%"));
  valor("cTemp", grados(metric.temp)); valor("cHumedad", textoPorDefecto(obs.humidity, "%"));
  valor("cViento", Number.isFinite(metric.windSpeed) ? `${metric.windSpeed} km/h ${direccion(obs.winddir)}` : "--");
  valor("cDireccion", Number.isFinite(obs.winddir) ? `${direccion(obs.winddir)} · ${Math.round(obs.winddir)}°` : "--"); valor("cRafagas", Number.isFinite(metric.windGust) ? `${metric.windGust} km/h` : "--");
  const acumulado = Number.isFinite(metric.precipTotal) ? `${metric.precipTotal} mm acum.` : "Acumulado no informado";
  valor("cLluvia", Number.isFinite(metric.precipRate) ? `${intensidadLluvia(metric.precipRate)} · ${metric.precipRate} mm/h · ${acumulado}` : acumulado);
  valor("cST", grados(sensacion)); valor("cPresion", Number.isFinite(metric.pressure) ? `${metric.pressure} hPa` : "--");
  valor("cRocio", grados(rocio));
  valor("cComfort", confort);
  const detallesConfort = [];
  if (Number.isFinite(indiceHumidex) && indiceHumidex >= 20) detallesConfort.push(`Humidex ${Math.round(indiceHumidex)}`);
  if (Number.isFinite(calor)) detallesConfort.push(`Índice de calor ${Math.round(calor)}°`);
  if (Number.isFinite(enfriamiento) && metric.temp <= 10 && metric.windSpeed > 4.8) detallesConfort.push(`Wind chill ${Math.round(enfriamiento)}°`);
  valor("cComfortDetail", detallesConfort.join(" · ") || "Indicador orientativo");
  actualizarTendenciasYRegistros(obs, guardarObservacionLocal(obs));
  const fecha = new Date(obs.obsTimeLocal);
  valor("actualizacion", `Actualizado: ${fecha.toLocaleDateString("es-AR")} · ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`);
}

function mensajePronostico(id, mensaje) { document.getElementById(id).innerHTML = `<p class="forecast-message">${mensaje}</p>`; }
function fuentePronostico(id, disponible) {
  const fuente = document.getElementById(id);
  fuente.hidden = !disponible;
  fuente.textContent = disponible ? "Fuente: Weather.com" : "";
}

function datosSimboloMeteored(simbolo) { return METEORED_SIMBOLOS[simbolo] || ["Estado no informado", "fa-cloud"]; }
function iconoMeteored(simbolo) { return datosSimboloMeteored(simbolo)[1]; }

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
    const estado = datosSimboloMeteored(dia.symbol);
    tarjeta.className = "day-card";
    tarjeta.innerHTML = `<time>${fecha}</time><span class="day-condition"><i class="fa-solid ${estado[1]}" aria-hidden="true"></i><span>${estado[0]}</span></span><span><span class="day-temperatures"><span>${grados(dia.temperature_min)}</span><strong>${grados(dia.temperature_max)}</strong></span><span class="rain-chance"><i class="fa-solid fa-droplet" aria-hidden="true"></i>${textoPorDefecto(dia.rain_probability, "%")} · <i class="fa-solid fa-wind" aria-hidden="true"></i>${textoPorDefecto(dia.wind_speed, " km/h")}</span></span>`;
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

}

function productoSatelitalActual() { return document.getElementById("satelliteProduct").value; }

function mostrarCuadroSatelital() {
  const imagen = document.getElementById("satelliteImage");
  const meta = document.getElementById("satelliteMeta");
  const cuadro = satelite.imagenes[satelite.indice];
  if (!cuadro) return;
  imagen.alt = `Animación satelital GOES-19 de Argentina — ${CONAE_PRODUCTS[productoSatelitalActual()] || "producto satelital"}`;
  imagen.src = cuadro.url;
  meta.textContent = `Última imagen: ${satelite.ultimaFecha} UTC · Cuadro ${satelite.indice + 1} de ${satelite.imagenes.length}.`;
}

function cambiarCuadroSatelital(paso) {
  if (!satelite.imagenes.length) return;
  satelite.indice = (satelite.indice + paso + satelite.imagenes.length) % satelite.imagenes.length;
  mostrarCuadroSatelital();
}

function actualizarBotonReproduccion() {
  const boton = document.getElementById("satellitePlay");
  boton.innerHTML = satelite.reproduciendo ? '<i class="fa-solid fa-pause" aria-hidden="true"></i> Pausar' : '<i class="fa-solid fa-play" aria-hidden="true"></i> Reproducir';
}

function configurarAnimacionSatelital() {
  window.clearInterval(satelite.temporizador);
  satelite.temporizador = satelite.reproduciendo ? window.setInterval(function () { cambiarCuadroSatelital(1); }, CONFIG.cuadroSateliteMs) : null;
  actualizarBotonReproduccion();
}

/** Obtiene la secuencia oficial de CONAE; la petición simple evita preflight y no recarga el sitio. */
async function actualizarSatelite() {
  const boton = document.getElementById("refreshSatellite");
  const imagen = document.getElementById("satelliteImage");
  const aviso = document.getElementById("satellitePlaceholder");
  const producto = productoSatelitalActual();
  boton.disabled = true;
  try {
    const cuerpo = new FormData();
    cuerpo.append("tipo", producto); cuerpo.append("cant", "6"); cuerpo.append("frec", "30");
    const respuesta = await fetch(CONAE_ANIMATION_URL, { method: "POST", body: cuerpo, cache: "no-store" });
    if (!respuesta.ok) throw new Error(`CONAE respondió ${respuesta.status}`);
    const datos = await respuesta.json();
    const imagenes = datos && datos.items && Array.isArray(datos.items.imagenes) ? datos.items.imagenes : [];
    if (!imagenes.length) throw new Error("CONAE no devolvió imágenes");
    satelite.imagenes = imagenes.map(function (item) { return { url: new URL(item.image, CONAE_BASE_URL).href }; });
    satelite.indice = 0;
    satelite.ultimaFecha = datos.items.ultFecha || "no informada por CONAE";
    aviso.hidden = true; imagen.hidden = false;
    mostrarCuadroSatelital(); configurarAnimacionSatelital();
  } catch (error) {
    console.error("No se pudo actualizar el satélite:", error);
    window.clearInterval(satelite.temporizador); satelite.temporizador = null;
    imagen.hidden = true; aviso.hidden = false;
    document.getElementById("satelliteMessage").textContent = "Imagen satelital temporalmente no disponible.";
    document.getElementById("satelliteMeta").textContent = "No fue posible obtener la secuencia de CONAE. El resto del dashboard continúa disponible.";
  } finally { boton.disabled = false; }
}

function iniciarSatelite() {
  const imagen = document.getElementById("satelliteImage");
  imagen.onerror = function () {
    imagen.hidden = true;
    document.getElementById("satellitePlaceholder").hidden = false;
    document.getElementById("satelliteMessage").textContent = "Imagen satelital temporalmente no disponible.";
    document.getElementById("satelliteMeta").textContent = "CONAE entregó la secuencia, pero una imagen no pudo cargarse. Reintentá actualizar el satélite.";
  };
  document.getElementById("refreshSatellite").addEventListener("click", actualizarSatelite);
  document.getElementById("satelliteProduct").addEventListener("change", actualizarSatelite);
  document.getElementById("satellitePrevious").addEventListener("click", function () { cambiarCuadroSatelital(-1); });
  document.getElementById("satelliteNext").addEventListener("click", function () { cambiarCuadroSatelital(1); });
  document.getElementById("satellitePlay").addEventListener("click", function () { satelite.reproduciendo = !satelite.reproduciendo; configurarAnimacionSatelital(); });
  actualizarSatelite();
  window.setInterval(actualizarSatelite, CONFIG.sateliteMs);
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

cargarClima(); cargarPronosticos(); iniciarImagenesExternas(); iniciarSatelite();
setInterval(cargarClima, CONFIG.observacionesMs);
