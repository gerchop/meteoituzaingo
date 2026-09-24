import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../js/dashboard.js", import.meta.url), "utf8");
const start = source.indexOf("function etiquetaSeveridadCap");
const end = source.indexOf("async function cargarAlertasSmn", start);
assert.ok(start >= 0 && end > start, "Los helpers de severidad CAP deben estar aislados en Home.");
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.equal(context.etiquetaSeveridadCap("Extreme"), "Extrema");
assert.equal(context.etiquetaSeveridadCap("Severe"), "Severa");
assert.equal(context.etiquetaSeveridadCap("Moderate"), "Moderada");
assert.equal(context.etiquetaSeveridadCap("Minor"), "Menor");
assert.equal(context.etiquetaSeveridadCap("Unknown"), "No determinada");
assert.equal(context.etiquetaSeveridadCap(), null);
assert.equal(context.etiquetaSeveridadCap("invalid"), null);
assert.match(context.ayudaSeveridadCap(), /No equivale al nivel amarillo, naranja o rojo/i);
assert.doesNotMatch(source.slice(start, end), /alert\.urgency|alert\.certainty/);

console.log("smn alerts frontend tests: OK (CAP catalog, absent/invalid fallback and SAT separation)");
