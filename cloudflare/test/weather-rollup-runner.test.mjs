import assert from "node:assert/strict";
import worker from "../src/index.js";
import { BACKFILL_LEASE_MS } from "../src/weather-rollup-runner.js";
assert.equal(BACKFILL_LEASE_MS, 120000);
for (const path of ["status", "backfill", "validate", "finalize"]) { const method = path === "status" ? "GET" : "POST"; const response = await worker.fetch(new Request(`https://worker.example/api/admin/weather-rollups/${path}`, { method }), { ALLOWED_ORIGINS: "https://gerchop.github.io" }); assert.equal(response.status, 401, `${path} exige ADMIN_TOKEN`); }
console.log("weather rollup runner tests: OK (admin routes require capture authentication)");