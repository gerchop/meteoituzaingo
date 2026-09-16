import assert from "node:assert/strict";
import { getDayPartForLocalTime, getDayPartsForInterval } from "../src/advisory-time.js";

const at = (date, hour, minute = 0) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
const parts = (startDate, startHour, endDate, endHour) => getDayPartsForInterval(at(startDate, startHour), at(endDate, endHour));

// Canonical ART boundaries.
assert.equal(getDayPartForLocalTime(at("2026-09-16", 0)), "dawn");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 5, 59)), "dawn");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 6)), "morning");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 11, 59)), "morning");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 12)), "afternoon");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 17, 59)), "afternoon");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 18)), "night");
assert.equal(getDayPartForLocalTime(at("2026-09-16", 23, 59)), "night");
assert.equal(getDayPartForLocalTime("invalid"), null);

assert.deepEqual(parts("2026-09-16", 3, "2026-09-16", 5).map((item) => item.dayParts), [["dawn"]]);
assert.deepEqual(parts("2026-09-16", 5, "2026-09-16", 7).map((item) => item.dayParts), [["dawn", "morning"]]);
assert.deepEqual(parts("2026-09-16", 10, "2026-09-16", 14).map((item) => item.dayParts), [["morning", "afternoon"]]);
assert.deepEqual(parts("2026-09-16", 16, "2026-09-16", 20).map((item) => item.dayParts), [["afternoon", "night"]]);
assert.deepEqual(parts("2026-09-16", 19, "2026-09-16", 23).map((item) => item.dayParts), [["night"]]);
const midnight = parts("2026-09-16", 22, "2026-09-17", 2);
assert.deepEqual(midnight.map((item) => ({ date: item.date, dayParts: item.dayParts })), [{ date: "2026-09-16", dayParts: ["night"] }, { date: "2026-09-17", dayParts: ["dawn"] }]);
assert.deepEqual(parts("2026-09-16", 0, "2026-09-17", 0)[0].dayParts, ["dawn", "morning", "afternoon", "night"]);
assert.deepEqual(parts("2026-12-31", 22, "2027-01-01", 2).map((item) => item.date), ["2026-12-31", "2027-01-01"]);
assert.deepEqual(getDayPartsForInterval(at("2026-09-16", 2), at("2026-09-16", 2)), []);

console.log("advisory time tests: OK (18 deterministic scenarios)");
