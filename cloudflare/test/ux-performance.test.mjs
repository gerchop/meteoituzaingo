import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [home, historicalPage, dashboard, history, historyApi, css] = await Promise.all([
  readFile(new URL("../../dashboard.html", import.meta.url), "utf8"),
  readFile(new URL("../../historicos.html", import.meta.url), "utf8"),
  readFile(new URL("../../js/dashboard.js", import.meta.url), "utf8"),
  readFile(new URL("../../js/history.js", import.meta.url), "utf8"),
  readFile(new URL("../../js/history-api.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/dashboard.css", import.meta.url), "utf8")
]);

assert.doesNotMatch(home, /chart\.umd\.min\.js/, "Home must not put Chart.js on the initial path.");
assert.match(historicalPage, /chart\.umd\.min\.js/, "Históricos keeps Chart.js as a primary-page dependency.");
assert.match(home, /fonts\.googleapis\.com/);
assert.doesNotMatch(css, /@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/);
assert.match(dashboard, /function cargarChartJs\(\)/);
assert.match(dashboard, /function iniciarAlAcercarse\(/);
assert.match(dashboard, /iniciarAlAcercarse\(section, function \(\) \{/);
assert.match(dashboard, /iniciarAlAcercarse\(document\.getElementById\("radarFrame"\), iniciarRadar\)/);
assert.match(dashboard, /satelite\.visible && !satelite\.reducedMotion/);
assert.match(dashboard, /prefers-reduced-motion: reduce/);
assert.match(dashboard, /activeNoticeStrip/);
assert.doesNotMatch(home, /<main id="meteo-dashboard" aria-live=/);
assert.match(home, /id="activeNoticeStrip"/);
assert.match(css, /\.radar-frame \{ aspect-ratio:1 \/ 1/);
assert.match(css, /\.satellite-frame \{ aspect-ratio:45 \/ 31/);
assert.match(css, /#meteo-dashboard :is\(a,button,select,input\):focus-visible/);
assert.match(history, /new AbortController\(\)/);
assert.match(history, /historyLoadGeneration/);
assert.match(historyApi, /signal: options\.signal/);

console.log("ux performance tests: OK (lazy media/chart, reduced motion, mobile notices and history race safety)");
