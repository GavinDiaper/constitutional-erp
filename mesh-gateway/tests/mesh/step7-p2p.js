#!/usr/bin/env node

const { runStep7 } = require("./step7-lib");

runStep7({
  domain: "P2P",
  runnerScript: "run-p2p.js",
  environmentExport: "mesh-p2p-environment.json",
  requiredEnvKeys: ["requisitionId", "poId"],
  summaryEnvKeys: ["requisitionId", "poId"],
  aggregateEnvKeys: ["requisitionId", "poId"],
  pgeAggregateEnvKey: "poId",
  pgeAggregateType: "purchase-order"
}).catch((error) => {
  console.error("\nStep 7 P2P failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});