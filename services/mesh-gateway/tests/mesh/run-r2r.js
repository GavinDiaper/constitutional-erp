#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const newman = require("newman");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_DIR = path.join(ROOT, "reports", "newman");
const COLLECTION = path.join(ROOT, "postman", "MeshGateway.postman_collection.json");
const ENVIRONMENT = path.join(ROOT, "postman", "MeshGateway.local.postman_environment.json");
const ENV_EXPORT = path.join(REPORT_DIR, "mesh-r2r-environment.json");

const FOLDERS = [
  "02 – R2R Setup (Foundation ERP fixture)",
  "22 – R2R Hypermedia Proxy (GET resource)",
  "32 – R2R Action Execution (POST action)",
  "40 – Approval Workflow"
];

function ensureInputsExist() {
  const missing = [COLLECTION, ENVIRONMENT].filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    console.error("Missing required Postman file(s):");
    missing.forEach((p) => console.error(`- ${p}`));
    process.exit(1);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function printSummary(summary) {
  const run = summary.run;
  const stats = run.stats || {};
  const assertions = stats.assertions || { total: 0, failed: 0 };
  const requests = stats.requests || { total: 0, failed: 0 };

  console.log("\nR2R Newman Summary");
  console.log(`- Requests: ${requests.total} total, ${requests.failed} failed`);
  console.log(`- Assertions: ${assertions.total} total, ${assertions.failed} failed`);
  console.log(`- Duration: ${run.timings?.completed - run.timings?.started} ms`);
}

ensureInputsExist();

console.log("Starting R2R end-to-end flow via Mesh Gateway...\n");

newman.run(
  {
    collection: COLLECTION,
    environment: ENVIRONMENT,
    exportEnvironment: ENV_EXPORT,
    folder: FOLDERS,
    reporters: ["cli", "json"],
    reporter: {
      json: {
        export: path.join(REPORT_DIR, "mesh-r2r-results.json")
      }
    },
    insecure: true,
    bail: true
  },
  (err, summary) => {
    if (err) {
      console.error("Newman run failed to start:", err.message || err);
      process.exit(1);
    }

    const failures = summary.run.failures || [];
    printSummary(summary);

    if (failures.length > 0) {
      console.error("\nR2R flow completed with failures:\n");
      failures.forEach((failure) => {
        const source = failure.source?.name || "Unknown request";
        const detail = failure.error?.test || failure.error?.message || "Unknown failure";
        console.error(`- ${source}: ${detail}`);
      });
      process.exit(1);
    }

    console.log(`- Environment export: ${ENV_EXPORT}`);
    console.log("\nR2R flow completed successfully.\n");
    process.exit(0);
  }
);
