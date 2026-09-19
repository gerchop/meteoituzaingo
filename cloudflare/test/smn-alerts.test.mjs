import assert from "node:assert/strict";
import { CAP_BATCH_SIZE, CAP_CONCURRENCY, CAP_TIMEOUT_MS, mapWithConcurrency, normalizeCap, pointInPolygon, rssIdentities } from "../src/smn-alerts.js";

const NOW = Date.parse("2026-09-19T16:00:00-03:00");
const INSIDE = "-34.56,-58.52 -34.70,-58.52 -34.70,-58.90 -34.56,-58.90 -34.56,-58.52";
const OUTSIDE = "-26.8,-58.3 -26.9,-58.3 -26.9,-58.4 -26.8,-58.4 -26.8,-58.3";
function cap({ id, type = "Update", event, onset, expires, polygon = INSIDE, references = "" }) { return `<alert><identifier>${id}</identifier><msgType>${type}</msgType><sent>2026-09-19T09:18:54-03:00</sent>${references ? `<references>${references}</references>` : ""}<info><event>${event}</event><headline>${event}</headline><severity>Moderate</severity><urgency>Future</urgency><onset>${onset}</onset><expires>${expires}</expires><area><polygon>${polygon}</polygon></area></info></alert>`; }
const ids = Array.from({ length: 190 }, (_, index) => `https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_20260919_${index + 1}.xml`);
const rss = `<rss><channel>${ids.map((url) => `<item><guid>${url}</guid><link>${url}</link><title>x</title></item>`).join("")}</channel></rss>`;

assert.equal(CAP_BATCH_SIZE, 8);
assert.equal(CAP_CONCURRENCY, 3);
assert.equal(CAP_TIMEOUT_MS, 8000);
assert.ok(1 + 1 + CAP_BATCH_SIZE <= 10, "El presupuesto SMN con discovery debe ser <= 10");
assert.equal(rssIdentities(rss).length, 190, "El RSS completo no debe truncarse");
assert.equal(rssIdentities(rss)[75], ids[75]);
assert.equal(rssIdentities(rss)[162], ids[162]);
assert.equal(rssIdentities(rss)[189], ids[189]);
assert.equal(pointInPolygon(INSIDE), true);
assert.equal(pointInPolygon(OUTSIDE), false);
let active = 0, maximum = 0;
const processed = await mapWithConcurrency(ids, CAP_CONCURRENCY, async (value) => { active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1; return value; });
assert.equal(processed.length, 190);
assert.ok(maximum <= CAP_CONCURRENCY, `Concurrencia observada ${maximum}`);
const storm = normalizeCap(ids[75], cap({ id: "urn:oid:storm-update", event: "Tormentas", onset: "2026-09-20T15:00:00-03:00", expires: "2026-09-20T20:59:59-03:00", references: "smn@smn.gob.ar,urn:oid:storm-alert,2026-09-18T21:15:00-03:00" }), NOW);
const wind = normalizeCap(ids[162], cap({ id: "urn:oid:wind-update", event: "Viento", onset: "2026-09-21T15:00:00-03:00", expires: "2026-09-21T20:59:59-03:00" }), NOW);
assert.equal(storm.payload.length, 1, "Onset futuro debe mantenerse");
assert.equal(storm.payload[0].event, "Tormentas");
assert.equal(storm.msgType, "Update");
assert.deepEqual(storm.refs, ["urn:oid:storm-alert"]);
assert.equal(wind.payload.length, 1);
assert.equal(wind.payload[0].event, "Viento");
assert.equal(normalizeCap(ids[189], cap({ id: "urn:oid:last", type: "Alert", event: "Último", onset: "2026-09-20T15:00:00-03:00", expires: "2026-09-20T20:59:59-03:00" }), NOW).payload.length, 1);
assert.equal(normalizeCap(ids[1], cap({ id: "urn:oid:outside", event: "Fuera", onset: "2026-09-20T15:00:00-03:00", expires: "2026-09-20T20:59:59-03:00", polygon: OUTSIDE }), NOW).payload.length, 0);
assert.equal(normalizeCap(ids[2], cap({ id: "urn:oid:expired", event: "Expirada", onset: "2026-09-18T15:00:00-03:00", expires: "2026-09-19T15:00:00-03:00" }), NOW).payload.length, 0);
assert.equal(normalizeCap(ids[3], cap({ id: "urn:oid:cancel", type: "Cancel", event: "Cancel", onset: "2026-09-20T15:00:00-03:00", expires: "2026-09-20T20:59:59-03:00", references: "smn@smn.gob.ar,urn:oid:storm-alert,2026-09-18T21:15:00-03:00" }), NOW).payload.length, 0);
console.log("smn-alerts.test.mjs: OK");
