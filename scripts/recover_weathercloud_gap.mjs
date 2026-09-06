#!/usr/bin/env node
/**
 * Recuperación puntual de observaciones WeatherCloud.
 *
 * Uso seguro (no modifica D1):
 *   node scripts/recover_weathercloud_gap.mjs --csv "ruta/al/archivo.csv" --preview
 *
 * La opción --apply existe únicamente para la fase aprobada de recuperación. Vuelve
 * a consultar D1 y emite INSERT ... SELECT ... WHERE NOT EXISTS; nunca ejecuta
 * UPDATE, DELETE ni REPLACE.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE = "meteoituzaingo-history";
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const REPO_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const CLOUDFLARE_DIRECTORY = resolve(REPO_ROOT, "cloudflare");
const WRANGLER_CLI = resolve(CLOUDFLARE_DIRECTORY, "node_modules", "wrangler", "bin", "wrangler.js");
const D1_COLUMNS = [
  "observed_at", "temperature", "feels_like", "humidity", "pressure",
  "wind_speed", "wind_gust", "wind_direction", "wind_direction_degrees",
  "precip_rate", "precip_total", "dew_point", "weather_condition", "created_at"
];
const HEADER_ALIASES = {
  observedAt: ["fecha hora", "fecha/hora", "fecha", "date time", "timestamp"],
  temperature: ["temperatura exterior", "temperatura ext", "temperatura", "outdoor temperature", "temperature"],
  feelsLike: ["sensacion termica", "sensacion", "feels like", "apparent temperature"],
  dewPoint: ["punto de rocio", "dew point"],
  humidity: ["humedad", "humedad exterior", "outdoor humidity", "humidity"],
  windSpeed: ["velocidad media del viento", "velocidad viento", "viento", "wind speed", "average wind speed"],
  windGust: ["rafaga maxima", "rafaga", "wind gust", "maximum gust"],
  windDirection: ["direccion media del viento", "direccion del viento", "direccion viento", "wind direction"],
  pressure: ["presion atmosferica", "presion", "pressure", "barometer"],
  precipTotal: ["lluvia", "precipitacion", "rain", "rainfall"],
  precipRate: ["intensidad de lluvia", "intensidad lluvia", "rain rate", "precipitation rate"]
};
const CARDINAL_DEGREES = {
  N: 0, NNE: 22.5, NNO: 337.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5,
  SE: 135, SSE: 157.5, S: 180, SSO: 202.5, SO: 225, OSO: 247.5,
  O: 270, ONO: 292.5, NO: 315
};

function fail(message) { console.error(`ERROR: ${message}`); process.exitCode = 1; throw new Error(message); }
function normalize(text) { return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[._()\[\]-]+/g, " ").replace(/\s+/g, " ").trim(); }
function parseArgs(args) {
  const options = { preview: true, apply: false, csv: null, gapStart: null, gapEnd: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--csv") options.csv = args[++index];
    else if (args[index] === "--gap-start") options.gapStart = args[++index];
    else if (args[index] === "--gap-end") options.gapEnd = args[++index];
    else if (args[index] === "--apply") { options.apply = true; options.preview = false; }
    else if (args[index] === "--preview") options.preview = true;
    else if (args[index] === "--help") {
      console.log("Uso: node scripts/recover_weathercloud_gap.mjs --csv <archivo.csv> [--preview|--apply] [--gap-start <UTC>] [--gap-end <UTC>]");
      process.exit(0);
    } else fail(`Argumento no reconocido: ${args[index]}`);
  }
  if (!options.csv) fail("Indique el CSV original con --csv.");
  if ((options.gapStart && !options.gapEnd) || (!options.gapStart && options.gapEnd)) fail("--gap-start y --gap-end deben indicarse juntos.");
  return options;
}
function decodeCsv(path) {
  const bytes = readFileSync(path);
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
  return text;
}
function detectDelimiter(line) {
  return [";", ",", "\t"].map((delimiter) => ({ delimiter, count: (line.match(new RegExp(`\\${delimiter}`, "g")) || []).length })).sort((a, b) => b.count - a.count)[0].delimiter;
}
function splitCsvLine(line, delimiter) {
  const cells = []; let cell = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') { if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}
function parseCsv(path) {
  const lines = decodeCsv(path).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
  if (lines.length < 2) fail("El CSV no contiene cabecera y registros.");
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const records = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line, delimiter);
    if (values.length !== headers.length) fail(`Fila ${index + 2}: ${values.length} celdas; se esperaban ${headers.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
  return { delimiter, headers, records };
}
function findHeaders(headers) {
  const normalized = headers.map((header) => ({ header, normalized: normalize(header) }));
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) => {
    // El CSV WeatherCloud puede incluir la misma medición interior y exterior.
    // La tabla pública sólo usa observaciones exteriores.
    const exterior = normalized.filter(({ normalized: value }) => !value.includes("interior"));
    const found = exterior.find(({ normalized: value }) => aliases.some((alias) => value === alias || value.startsWith(`${alias} `)));
    return [field, found?.header ?? null];
  }));
}
function parseRegionalNumber(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "-" || /^n\/?a$/i.test(value)) return null;
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : /^[-+]?\d{1,3}(?:\.\d{3})+$/.test(compact) ? compact.replace(/\./g, "") : compact;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) throw new Error(`Número regional inválido: «${value}»`);
  return numeric;
}
function zonedLocalToUtc(text) {
  const match = String(text ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error(`Fecha local inválida: «${text}»; se esperaba dd/mm/aaaa HH:mm[:ss].`);
  const [, day, month, year, hour, minute, second = "0"] = match;
  const expected = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) };
  let utc = Date.UTC(expected.year, expected.month - 1, expected.day, expected.hour, expected.minute, expected.second);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utc)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const formattedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wantedAsUtc = Date.UTC(expected.year, expected.month - 1, expected.day, expected.hour, expected.minute, expected.second);
    utc -= formattedAsUtc - wantedAsUtc;
  }
  return new Date(utc).toISOString();
}
function cardinal(value) {
  const direction = normalize(value).toUpperCase().replace(/\s/g, "");
  const aliases = { "NORTE": "N", "SUR": "S", "ESTE": "E", "OESTE": "O", "NOROESTE": "NO", "NORESTE": "NE", "SUDESTE": "SE", "SUROESTE": "SO" };
  return aliases[direction] || direction || null;
}
function cardinalFromDegrees(degrees) {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return Number.isFinite(degrees) ? directions[Math.round(degrees / 22.5) % 16] : null;
}
function checkRange(label, value, minimum, maximum, errors) { if (value !== null && (value < minimum || value > maximum)) errors.push(`${label}: ${value} fuera del rango ${minimum}–${maximum}.`); }
function normalizeRecords(csv, mappedHeaders) {
  if (!mappedHeaders.observedAt || !mappedHeaders.temperature) fail("No se identificaron las columnas obligatorias de fecha/hora y temperatura. Revise los headers del CSV.");
  const errors = []; const timestamps = new Set(); const records = [];
  csv.records.forEach((row, index) => {
    try {
      const value = (field) => mappedHeaders[field] ? row[mappedHeaders[field]] : "";
      const observedAt = zonedLocalToUtc(value("observedAt"));
      if (timestamps.has(observedAt)) errors.push(`Fila ${index + 2}: timestamp duplicado ${observedAt}.`);
      timestamps.add(observedAt);
      const directionRaw = value("windDirection");
      const directionNumber = parseRegionalNumber(directionRaw);
      const direction = directionNumber === null ? cardinal(directionRaw) : cardinalFromDegrees(directionNumber);
      const directionDegrees = directionNumber ?? (direction ? CARDINAL_DEGREES[direction] ?? null : null);
      const record = {
        localTimestamp: value("observedAt"), observedAt, temperature: parseRegionalNumber(value("temperature")),
        feelsLike: parseRegionalNumber(value("feelsLike")), humidity: parseRegionalNumber(value("humidity")),
        pressure: parseRegionalNumber(value("pressure")), windSpeed: parseRegionalNumber(value("windSpeed")),
        windGust: parseRegionalNumber(value("windGust")), windDirection: direction, windDirectionDegrees: directionDegrees,
        precipRate: parseRegionalNumber(value("precipRate")), precipTotal: parseRegionalNumber(value("precipTotal")),
        dewPoint: parseRegionalNumber(value("dewPoint")), weatherCondition: null
      };
      if (record.temperature === null) errors.push(`Fila ${index + 2}: temperatura vacía.`);
      checkRange("Temperatura", record.temperature, -80, 70, errors); checkRange("Humedad", record.humidity, 0, 100, errors);
      checkRange("Presión", record.pressure, 800, 1100, errors); checkRange("Dirección", record.windDirectionDegrees, 0, 360, errors);
      checkRange("Viento", record.windSpeed, 0, 300, errors); checkRange("Ráfaga", record.windGust, 0, 300, errors);
      checkRange("Lluvia", record.precipTotal, 0, 1000, errors); checkRange("Intensidad de lluvia", record.precipRate, 0, 1000, errors);
      records.push(record);
    } catch (error) { errors.push(`Fila ${index + 2}: ${error.message}`); }
  });
  records.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const intervals = records.slice(1).map((record, index) => (Date.parse(record.observedAt) - Date.parse(records[index].observedAt)) / 60000);
  return { records, errors, intervals };
}
function d1(command) {
  const result = spawnSync(process.execPath, [WRANGLER_CLI, "d1", "execute", DATABASE, "--remote", "--command", command], {
    cwd: CLOUDFLARE_DIRECTORY,
    encoding: "utf8"
  });
  if (result.status !== 0) fail(`Wrangler D1 falló: ${result.error?.message || result.stderr || result.stdout || "sin salida"}`);
  const jsonStart = result.stdout.search(/^\s*\[/m);
  if (jsonStart === -1) fail(`No se pudo interpretar la respuesta de D1: ${result.stdout}`);
  const output = JSON.parse(result.stdout.slice(jsonStart).trim());
  if (!output[0]?.success) fail("D1 informó una consulta no exitosa.");
  return output[0].results || [];
}
function sqlQuote(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function existingTimestamps(records) {
  if (!records.length) return new Set();
  const min = records[0].observedAt; const max = records.at(-1).observedAt;
  const rows = d1(`SELECT observed_at FROM weather_observations WHERE observed_at >= ${sqlQuote(min)} AND observed_at <= ${sqlQuote(max)} ORDER BY observed_at`);
  return new Set(rows.map((row) => row.observed_at));
}
function gapBounds(records, options) {
  if (!records.length) fail("No hay registros CSV para determinar el hueco.");
  if (options.gapStart && options.gapEnd) {
    const lastBefore = d1(`SELECT observed_at, temperature, humidity, pressure, wind_speed, wind_gust, precip_total FROM weather_observations WHERE observed_at = ${sqlQuote(options.gapStart)} LIMIT 1`)[0];
    const firstAfter = d1(`SELECT observed_at, temperature, humidity, pressure, wind_speed, wind_gust, precip_total FROM weather_observations WHERE observed_at = ${sqlQuote(options.gapEnd)} LIMIT 1`)[0];
    if (!lastBefore || !firstAfter) fail("Los limites UTC indicados no existen en D1; se cancela para evitar ampliar el hueco.");
    if (lastBefore.observed_at >= firstAfter.observed_at) fail("Los limites UTC no definen un intervalo valido.");
    return { lastBefore, firstAfter };
  }
  const firstCsv = records[0].observedAt;
  const lastBefore = d1(`SELECT observed_at, temperature, humidity, pressure, wind_speed, wind_gust, precip_total FROM weather_observations WHERE observed_at < ${sqlQuote(firstCsv)} ORDER BY observed_at DESC LIMIT 1`)[0];
  if (!lastBefore) fail("No existe una observación D1 anterior al período CSV; no se puede determinar un hueco seguro.");
  const firstAfter = d1(`SELECT observed_at, temperature, humidity, pressure, wind_speed, wind_gust, precip_total FROM weather_observations WHERE observed_at > ${sqlQuote(lastBefore.observed_at)} ORDER BY observed_at ASC LIMIT 1`)[0];
  if (!firstAfter) fail("No existe una observación D1 posterior al corte; no se puede determinar un límite seguro del hueco.");
  return { lastBefore, firstAfter };
}
function rowSummary(record) {
  return `${record.localTimestamp} | ${record.observedAt} | temp ${record.temperature ?? "NULL"} °C | hum ${record.humidity ?? "NULL"} % | presión ${record.pressure ?? "NULL"} hPa | viento ${record.windSpeed ?? "NULL"} km/h | ráfaga ${record.windGust ?? "NULL"} km/h | dirección ${record.windDirection ?? "NULL"}/${record.windDirectionDegrees ?? "NULL"}° | lluvia ${record.precipTotal ?? "NULL"} mm`;
}
function printPreview({ csvPath, csv, mappedHeaders, normalized, existing, bounds }) {
  const insideGap = (record) => record.observedAt > bounds.lastBefore.observed_at && record.observedAt < bounds.firstAfter.observed_at;
  const alreadyExisting = normalized.records.filter((record) => existing.has(record.observedAt));
  const outsideGap = normalized.records.filter((record) => !existing.has(record.observedAt) && !insideGap(record));
  const candidates = normalized.records.filter((record) => !existing.has(record.observedAt) && insideGap(record));
  const gaps = normalized.intervals.filter((minutes) => minutes !== 10);
  console.log("\n================================================");
  console.log("RECUPERACIÓN WEATHERCLOUD — PREVIEW");
  console.log("================================================");
  console.log(`Archivo: ${csvPath}`); console.log(`Encoding detectado: UTF-8 o Windows-1252; delimitador: ${JSON.stringify(csv.delimiter)}`);
  console.log(`Headers: ${csv.headers.join(" | ")}`); console.log(`Registros CSV: ${normalized.records.length}`);
  if (normalized.records.length) { console.log(`Período CSV local: ${normalized.records[0].localTimestamp} → ${normalized.records.at(-1).localTimestamp}`); console.log(`Período UTC: ${normalized.records[0].observedAt} → ${normalized.records.at(-1).observedAt}`); }
  console.log(`Timezone de conversión: ${TIME_ZONE}`);
  console.log(`Última observación D1 antes del hueco: ${bounds.lastBefore.observed_at}`);
  console.log(`Primera observación D1 posterior al hueco: ${bounds.firstAfter.observed_at}`);
  console.log(`Registros ya existentes (timestamp exacto): ${alreadyExisting.length}`); console.log(`Registros fuera del hueco: ${outsideGap.length}`); console.log(`Registros candidatos a insertar: ${candidates.length}`);
  console.log(`Duplicados CSV: ${normalized.errors.filter((item) => item.includes("duplicado")).length}`); console.log(`Errores de conversión/sanity checks: ${normalized.errors.length}`);
  console.log(`Intervalos no equivalentes a 10 minutos: ${gaps.length}${gaps.length ? ` (${gaps.join(", ")} min)` : ""}`);
  console.log("\nMapping detectado:");
  Object.entries(mappedHeaders).forEach(([field, header]) => console.log(`- ${header ?? "(no mapeado)"} → ${field}`));
  console.log("\nPrimeros 10 candidatos:"); candidates.slice(0, 10).forEach((record) => console.log(`- ${rowSummary(record)}`));
  console.log("\nÚltimos 10 candidatos:"); candidates.slice(-10).forEach((record) => console.log(`- ${rowSummary(record)}`));
  if (normalized.errors.length) { console.log("\nErrores:"); normalized.errors.forEach((error) => console.log(`- ${error}`)); }
  const firstCandidate = candidates[0]; const lastCandidate = candidates.at(-1);
  const temperatureJumpStart = firstCandidate ? Math.abs(firstCandidate.temperature - bounds.lastBefore.temperature) : null;
  const temperatureJumpEnd = lastCandidate ? Math.abs(lastCandidate.temperature - bounds.firstAfter.temperature) : null;
  console.log("\nComparación de bordes:");
  console.log(`- D1 previo ${bounds.lastBefore.observed_at} (${bounds.lastBefore.temperature} °C) → primer candidato ${firstCandidate?.observedAt ?? "sin candidato"} (${firstCandidate?.temperature ?? "N/A"} °C); diferencia ${temperatureJumpStart ?? "N/A"} °C.`);
  console.log(`- Último candidato ${lastCandidate?.observedAt ?? "sin candidato"} (${lastCandidate?.temperature ?? "N/A"} °C) → D1 posterior ${bounds.firstAfter.observed_at} (${bounds.firstAfter.temperature} °C); diferencia ${temperatureJumpEnd ?? "N/A"} °C.`);
  if ((temperatureJumpStart !== null && temperatureJumpStart > 15) || (temperatureJumpEnd !== null && temperatureJumpEnd > 15)) console.log("- Advertencia: salto térmico importante; revisar antes de aplicar.");
  else console.log("- Sin saltos térmicos importantes en los bordes.");
  console.log("\nNO SE MODIFICÓ D1.");
  return { candidates, outsideGap, alreadyExisting };
}
function insertStatement(record) {
  const values = [record.observedAt, record.temperature, record.feelsLike, record.humidity, record.pressure, record.windSpeed, record.windGust, record.windDirection, record.windDirectionDegrees, record.precipRate, record.precipTotal, record.dewPoint, record.weatherCondition, new Date().toISOString()];
  const sqlValue = (value) => value === null ? "NULL" : typeof value === "number" ? String(value) : sqlQuote(value);
  return `INSERT INTO weather_observations (${D1_COLUMNS.join(", ")}) SELECT ${values.map(sqlValue).join(", ")} WHERE NOT EXISTS (SELECT 1 FROM weather_observations WHERE observed_at = ${sqlQuote(record.observedAt)});`;
}
function insertBatch(records) {
  if (!records.length) return;
  // La API SQL remota de D1 no admite BEGIN/COMMIT. Se envia una sola solicitud
  // con INSERT condicionales; cada sentencia es idempotente por observed_at.
  d1(records.map(insertStatement).join("\n"));
}
function main() {
  const options = parseArgs(process.argv.slice(2)); const csvPath = resolve(options.csv);
  const csv = parseCsv(csvPath); const mappedHeaders = findHeaders(csv.headers); const normalized = normalizeRecords(csv, mappedHeaders);
  const existing = existingTimestamps(normalized.records); const bounds = gapBounds(normalized.records, options); const preview = printPreview({ csvPath, csv, mappedHeaders, normalized, existing, bounds }); const { candidates } = preview;
  if (options.apply) {
    if (normalized.errors.length) fail("No se ejecuta --apply: el preview contiene errores de conversión o validación.");
    const before = d1(`SELECT COUNT(*) AS count FROM weather_observations WHERE observed_at >= ${sqlQuote(normalized.records[0].observedAt)} AND observed_at <= ${sqlQuote(normalized.records.at(-1).observedAt)}`)[0].count;
    insertBatch(candidates);
    const after = d1(`SELECT COUNT(*) AS count FROM weather_observations WHERE observed_at >= ${sqlQuote(normalized.records[0].observedAt)} AND observed_at <= ${sqlQuote(normalized.records.at(-1).observedAt)}`)[0].count;
    console.log(`\nAplicación finalizada: ${after - before} filas insertadas; ${candidates.length} candidatas previsualizadas.`);
  }
}
main();
