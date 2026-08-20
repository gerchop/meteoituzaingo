const History = window.MeteoHistoryConfig;
const HistoryApi = window.MeteoHistoryApi;
const DateTime = window.MeteoDateTime;
const chartCache = new Map();
const charts = {};
const CACHE_MS = 600000;
const labels = { "hours=24": "Últimas 24 horas", "days=7": "Últimos 7 días", "days=30": "Últimos 30 días" };

function values(data, key) { return data.map(function (item) { return item[key]; }).filter(Number.isFinite); }
function stat(data, key, kind) {
  const list = values(data, key);
  if (!list.length) return null;
  if (kind === "min") return Math.min(...list);
  if (kind === "max") return Math.max(...list);
  return list.reduce(function (total, value) { return total + value; }, 0) / list.length;
}
function destroyCharts() { Object.values(charts).forEach(function (chartInstance) { chartInstance.destroy(); }); Object.keys(charts).forEach(function (key) { delete charts[key]; }); }
function directionLabel(data) {
  if (!data.windDirection) return "";
  return Number.isFinite(data.windDirectionDegrees) ? `Dirección: ${data.windDirection} (${Math.round(data.windDirectionDegrees)}°)` : `Dirección: ${data.windDirection}`;
}
function chart(id, data, datasets, type, includeDirection, period) {
  const canvas = document.getElementById(id);
  charts[id] = new window.Chart(canvas, {
    type,
    data: { labels: data.map(function (item) { return period === "hours=24" ? DateTime.formatTime(item.observedAt) : DateTime.formatShortDateTime(item.observedAt); }), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1 },
        tooltip: { callbacks: {
          title: function (context) { return DateTime.formatDateTime(data[context[0].dataIndex].observedAt); },
          afterBody: includeDirection ? function (context) { return directionLabel(data[context[0].dataIndex]); } : undefined
        } }
      },
      scales: { x: { ticks: { maxTicksLimit: 6, color: History.COLORS.muted }, grid: { display: false } }, y: { ticks: { color: History.COLORS.muted }, grid: { color: "rgba(97,115,129,.12)" } } }
    }
  });
}
function series(label, key, color, fill) {
  return { label, data: [], borderColor: color, backgroundColor: fill ? "rgba(25,118,185,.12)" : color, borderWidth: 2, pointRadius: 0, tension: 0.25, fill: Boolean(fill), key };
}
function render(data, period) {
  destroyCharts();
  const temperature = series("Temperatura °C", "temperature", History.COLORS.blue, true);
  const humidity = series("Humedad %", "humidity", History.COLORS.blue);
  const pressure = series("Presión hPa", "pressure", History.COLORS.navy);
  const wind = series("Viento km/h", "windSpeed", History.COLORS.blue);
  const gust = series("Ráfagas km/h", "windGust", History.COLORS.gust);
  const rain = { label: "Intensidad mm/h", data: [], backgroundColor: History.COLORS.rain, borderColor: History.COLORS.rain, key: "precipRate" };
  [temperature, humidity, pressure, wind, gust, rain].forEach(function (dataset) { dataset.data = data.map(function (item) { return item[dataset.key]; }); delete dataset.key; });
  chart("temperatureChart", data, [temperature], "line", false, period);
  chart("humidityChart", data, [humidity], "line", false, period);
  chart("pressureChart", data, [pressure], "line", false, period);
  chart("windChart", data, [wind, gust], "line", true, period);
  chart("rainChart", data, [rain], "bar", false, period);
}
function rainTotal(data) {
  const totals = data.filter(function (item) { return Number.isFinite(item.precipTotal); }).map(function (item) { return item.precipTotal; });
  if (totals.length < 2) return null;
  return totals.reduce(function (total, value, index) { return index ? total + (value >= totals[index - 1] ? value - totals[index - 1] : value) : total; }, 0);
}
function summary(data) {
  const pressure = values(data, "pressure");
  const items = [["Máxima", stat(data, "temperature", "max"), "°C"], ["Mínima", stat(data, "temperature", "min"), "°C"], ["Humedad máxima", stat(data, "humidity", "max"), "%"], ["Ráfaga máxima", stat(data, "windGust", "max"), "km/h"], ["Lluvia", rainTotal(data), "mm"], ["Variación presión", pressure.length > 1 ? pressure.at(-1) - pressure[0] : null, "hPa"]].filter(function (item) { return item[1] !== null; });
  const element = document.getElementById("periodSummary");
  element.innerHTML = items.map(function (item) { return `<article><span>${item[0]}</span><strong>${item[1].toFixed(1)} ${item[2]}</strong></article>`; }).join("");
  element.hidden = !items.length;
}
async function load(period) {
  document.getElementById("periodTitle").textContent = labels[period];
  document.querySelectorAll(".history-period").forEach(function (button) { const active = button.dataset.period === period; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
  const status = document.getElementById("historyStatus");
  document.getElementById("periodSummary").hidden = true;
  status.textContent = "Cargando históricos…";
  try {
    let cached = chartCache.get(period);
    if (!cached || Date.now() - cached.time > CACHE_MS) { cached = { time: Date.now(), data: await HistoryApi.fetchHistory(period) }; chartCache.set(period, cached); }
    if (!cached.data.length) { status.textContent = "Sin datos disponibles para este período."; destroyCharts(); return; }
    status.textContent = "";
    render(cached.data, period);
    summary(cached.data);
  } catch (error) { console.error("No se pudieron cargar los históricos:", error); status.textContent = "Históricos temporalmente no disponibles."; destroyCharts(); }
}
async function info() {
  try {
    const data = await HistoryApi.fetchInfo();
    if (data) document.getElementById("historyStart").textContent = `El histórico permanente comenzó a registrarse el ${DateTime.formatDateTime(data.firstObservation)}.`;
  } catch (error) { console.error("No se pudo consultar la información del histórico:", error); }
}

document.querySelectorAll(".history-period").forEach(function (button) { button.addEventListener("click", function () { load(button.dataset.period); }); });
info();
load("hours=24");
