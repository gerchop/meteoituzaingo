import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../js/dashboard.js", import.meta.url), "utf8");
const start = source.indexOf("function formatoValorAviso");
const end = source.indexOf("function mensajeAvisosLocales", start);
assert.ok(start >= 0 && end > start, "The advisory presentation helpers must remain isolated and present.");
const context = { Intl, Number, Array };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.equal(context.textoTemporalAviso({ temporalPrecision: "daily", targetLocalDate: "2026-09-16" }), "Jornada prevista: miércoles 16 de septiembre");
assert.equal(context.textoTemporalAviso({ temporalPrecision: "hourly", evidencePeriods: [{ date: "2026-09-16", dayParts: ["dawn"] }] }), "Período previsto: miércoles 16 de septiembre — madrugada");
assert.equal(context.textoTemporalAviso({ temporalPrecision: "hourly", evidencePeriods: [{ date: "2026-09-16", dayParts: ["afternoon", "night"] }] }), "Período previsto: miércoles 16 de septiembre — tarde y noche");
assert.equal(context.textoTemporalAviso({ temporalPrecision: "hourly", evidencePeriods: [{ date: "2026-09-16", dayParts: ["dawn", "morning", "afternoon", "night"] }] }), "Período previsto: miércoles 16 de septiembre — todo el día");
assert.equal(context.textoTemporalAviso({ temporalPrecision: "hourly", evidencePeriods: [{ date: "2026-09-16", dayParts: ["night"] }, { date: "2026-09-17", dayParts: ["dawn"] }] }), "Período previsto: miércoles 16 de septiembre — noche / jueves 17 de septiembre — madrugada");
assert.equal(context.formatoSensacionAviso({ forecastMinimumFeelsLikeC: -1 }), "Sensación térmica mínima prevista: -1 °C");
assert.equal(context.formatoSensacionAviso({}), "");

console.log("advisory frontend tests: OK (7 deterministic scenarios)");
