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
assert.equal(context.estadoPublicoAviso("no_advisory"), "Sin aviso");
assert.equal(context.estadoPublicoAviso("active"), "Aviso vigente");
assert.equal(context.estadoPublicoAviso("advisory"), "Aviso vigente");
assert.equal(context.estadoPublicoAviso("partial"), "Sin aviso");
assert.equal(context.estadoPublicoAviso("insufficient_data"), "Sin aviso");
assert.equal(context.estadoPublicoAviso("unavailable"), "Información temporalmente no disponible");
assert.equal(context.estadoPublicoAviso("error"), "Información temporalmente no disponible");
assert.equal(context.estadoPublicoAviso("unexpected"), "Información temporalmente no disponible");
assert.equal(context.iconoFamiliaAviso("thunderstorm"), "fa-cloud-bolt");
assert.equal(context.familiasAvisos({ families: [{ id: "thunderstorm" }] }).length, 1);
assert.equal(context.familiasAvisos({ advisories: [] })[0].publicStatus, "no_advisory");
assert.equal(context.familiasAvisos({ advisories: [{}] })[0].publicStatus, "active");
const thunderstormDetails = context.detalleTormenta({ values: { forecastDays: [{ date: "2026-09-16", dayParts: ["afternoon", "night"], precipitationProbability: 80, rainMm: 6.1 }] } }).flat();
assert.ok(thunderstormDetails.includes("Señal de tormenta prevista durante la tarde y noche."));
assert.ok(thunderstormDetails.includes("Probabilidad de precipitaciones: 80 %."));
assert.ok(thunderstormDetails.includes("Precipitación prevista: 6,1 mm."));

console.log("advisory frontend tests: OK (15 deterministic scenarios)");
