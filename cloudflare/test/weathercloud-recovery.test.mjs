import assert from "node:assert/strict";
import { TEMPORAL_DUPLICATE_TOLERANCE_MS, classifyRecords, normalizeRecords } from "../../scripts/recover_weathercloud_gap.mjs";

const bounds = { lastBefore: { observed_at: "2026-10-07T19:49:38.000Z" }, firstAfter: { observed_at: "2026-10-08T00:00:04.000Z" } };
const records = [
  { observedAt: "2026-10-07T19:40:00.000Z" }, { observedAt: "2026-10-07T19:50:00.000Z" },
  { observedAt: "2026-10-07T20:00:00.000Z" }, { observedAt: "2026-10-08T00:00:00.000Z" }
];
const classified = classifyRecords(records, bounds, [
  { observed_at: "2026-10-07T19:39:56.000Z" }, { observed_at: "2026-10-07T19:49:38.000Z" },
  { observed_at: "2026-10-08T00:00:04.000Z" }
]);
assert.equal(TEMPORAL_DUPLICATE_TOLERANCE_MS, 30_000);
assert.deepEqual(classified.map(({ status }) => status), ["temporal_collision", "temporal_collision", "candidate", "temporal_collision"]);
assert.equal(classifyRecords([{ observedAt: "2026-10-07T20:00:00.000Z" }], bounds, [{ observed_at: "2026-10-07T20:00:00.000Z" }])[0].status, "exact_duplicate");
assert.equal(classifyRecords([{ observedAt: "2026-10-07T20:10:00.000Z" }], bounds, [{ observed_at: "2026-10-07T20:00:00.000Z" }])[0].status, "candidate");
assert.equal(classifyRecords([{ observedAt: "2026-10-08T00:00:00.000Z" }], bounds, [{ observed_at: "2026-10-08T00:00:04.000Z" }])[0].status, "temporal_collision");

const headers = { observedAt: "time", temperature: "temperature", precipTotal: "total", precipRate: "rate" };
const normalized = normalizeRecords({ records: [
  { time: "07/10/2026 17:00", temperature: "18,1", total: "17,1", rate: "10,8" },
  { time: "07/10/2026 17:10", temperature: "18,0", total: "18,0", rate: "0" },
  { time: "07/10/2026 17:20", temperature: "17,9", total: "2,0", rate: "0" },
  { time: "07/10/2026 17:20", temperature: "17,9", total: "2,0", rate: "0" }
] }, headers);
assert.deepEqual(normalized.records.slice(0, 3).map((row) => row.precipTotal), [17.1, 18, 2]);
assert.equal(normalized.errors.filter((message) => message.includes("duplicado")).length, 1);
console.log("weathercloud recovery tests: OK");
