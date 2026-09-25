import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../js/dashboard.js", import.meta.url), "utf8");
const start = source.indexOf("function timestampMeteored");
const end = source.indexOf("function leerCacheMeteored", start);
assert.ok(start >= 0 && end > start, "UV helpers must remain isolated from DOM rendering.");

function element(tagName) {
  return {
    tagName,
    className: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  };
}
const elements = new Map(["uvForecast", "uvFutureDays", "uvSource"].map((id) => [id, element("div")]));
const document = { getElementById: (id) => elements.get(id) || null, createElement: element };
const context = { Intl, Number, Array, Object, Date, Map, Set, Math, document };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

for (const [value, category] of [[0, "Bajo"], [2.9, "Bajo"], [3, "Moderado"], [5.9, "Moderado"], [6, "Alto"], [6.9, "Alto"], [7.9, "Alto"], [8, "Muy alto"], [10.9, "Muy alto"], [11, "Extremo"], [15, "Extremo"]]) {
  assert.equal(context.categoriaUv(value), category, `UV ${value}`);
}
for (const value of [null, undefined, NaN, Infinity, -1, "6.9"]) assert.equal(context.valorUvDiario(value), null, `invalid UV ${String(value)}`);
assert.equal(context.valorUvDiario(0), 0);
assert.equal(context.formatoUv(6.9), "6,9");
assert.equal(context.formatoUv(8), "8");

const at = (date, hour = 0) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00-03:00`);
const artLateSep24 = Date.parse("2026-09-25T02:30:00.000Z");
const days = context.diasUvDiarios({ days: [
  { start: at("2026-09-24"), uv_index_max: 6.9 },
  { start: at("2026-09-25"), uv_index_max: 8 },
  { start: at("2026-09-26"), uv_index_max: null },
  { start: at("2026-09-27"), uv_index_max: "7" }
] });
assert.deepEqual(JSON.parse(JSON.stringify(days)), [
  { date: "2026-09-24", uv: 6.9, category: "Alto" },
  { date: "2026-09-25", uv: 8, category: "Muy alto" }
]);
assert.equal(context.fechaUvActual(artLateSep24), "2026-09-24", "Today is determined in ART, not UTC.");
assert.equal(context.etiquetaDiaUv("2026-09-24", "2026-09-24"), "Hoy");
assert.equal(context.etiquetaDiaUv("2026-09-25", "2026-09-24"), "Mañana");
assert.equal(context.etiquetaDiaUv("2026-09-26", "2026-09-24"), "sáb");
const duplicate = context.diasUvDiarios({ days: [{ start: at("2026-09-24"), uv_index_max: 6 }, { start: at("2026-09-24", 1), uv_index_max: 7 }] });
assert.deepEqual(JSON.parse(JSON.stringify(duplicate)), [], "Duplicate local dates are not guessed.");
context.renderizarUvDiario({ days: [{ start: at("2026-09-24"), uv_index_max: 6.9 }] }, artLateSep24);
assert.equal(elements.get("uvForecast").children[0].textContent, "6,9");
assert.equal(elements.get("uvForecast").children[1].textContent, "Alto");
assert.equal(elements.get("uvForecast").children[2].textContent, "Máximo previsto hoy.");
assert.equal(elements.get("uvSource").textContent, "Fuente: Meteored · Pronóstico diario.");
context.renderizarUvDiario({ days: [{ start: at("2026-09-24"), uv_index_max: null }] }, artLateSep24);
assert.match(elements.get("uvForecast").innerHTML, /Información UV temporalmente no disponible\./);
assert.equal(elements.get("uvFutureDays").hidden, true);
assert.equal(elements.get("uvSource").hidden, true);
assert.match(source, /Información UV temporalmente no disponible\./);
const hourlyStart = source.indexOf("function renderizarHorario");
const hourlyEnd = source.indexOf("function renderizarDiario", hourlyStart);
assert.doesNotMatch(source.slice(hourlyStart, hourlyEnd), /uv_index_max/, "UV daily is never rendered from hourly data.");

console.log("UV forecast tests: OK (decimal categories, validation and ART date selection)");
