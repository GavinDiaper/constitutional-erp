#!/usr/bin/env node

const { runStep7 } = require("./step7-lib");

runStep7({
  domain: "R2R",
  runnerScript: "run-r2r.js",
  environmentExport: "mesh-r2r-environment.json",
  requiredEnvKeys: ["accountId", "fiscalPeriodId", "journalId"],
  summaryEnvKeys: ["accountId", "fiscalPeriodId", "journalId"],
  aggregateEnvKeys: ["accountId", "journalId"],
  cepAggregateEnvKey: "journalId",
  cepAggregateType: "journal",
  pgeSkipReason: "canonical mapping pending for R2R journal -> journal-entry"
}).catch((error) => {
  console.error("\nStep 7 R2R failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});