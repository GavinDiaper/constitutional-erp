#!/usr/bin/env node

const { runStep7 } = require("./step7-lib");

runStep7({
  domain: "H2R",
  runnerScript: "run-h2r.js",
  environmentExport: "mesh-h2r-environment.json",
  requiredEnvKeys: ["employeeId", "positionId", "assignmentId", "credentialId"],
  summaryEnvKeys: ["employeeId", "positionId", "assignmentId", "credentialId"],
  aggregateEnvKeys: ["employeeId", "credentialId"],
  pgeAggregateEnvKey: "employeeId",
  pgeAggregateType: "employee"
}).catch((error) => {
  console.error("\nStep 7 H2R failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});