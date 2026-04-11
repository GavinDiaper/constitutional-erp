#!/usr/bin/env node

const { runStep7 } = require("./step7-lib");

runStep7({
  domain: "O2C",
  runnerScript: "run-o2c.js",
  environmentExport: "mesh-o2c-environment.json",
  requiredEnvKeys: ["customerId", "quoteId", "orderId"],
  summaryEnvKeys: ["customerId", "quoteId", "orderId"],
  aggregateEnvKeys: ["customerId", "quoteId", "orderId"],
  pgeAggregateEnvKey: "orderId",
  pgeAggregateType: "sales-order"
}).catch((error) => {
  console.error("\nStep 7 O2C failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});