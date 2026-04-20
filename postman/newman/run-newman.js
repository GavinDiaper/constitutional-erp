#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");

const targets = {
  foundation: {
    label: "FoundationERP",
    cwd: path.join(root, "services", "foundation-erp"),
    npmScript: "test:postman"
  },
  "foundation-projects-r2r-reporting": {
    label: "FoundationERP Projects + R2R Reporting",
    cwd: path.join(root, "services", "foundation-erp"),
    npmScript: "test:postman:projects-r2r-reporting"
  },
  authority: {
    label: "Authority Engine",
    cwd: path.join(root, "services", "authority-engine"),
    npmScript: "test:postman"
  },
  governance: {
    label: "Governance Engine",
    cwd: path.join(root, "services", "governance-engine"),
    npmScript: "test:postman"
  },
  mesh: {
    label: "Mesh Gateway",
    cwd: path.join(root, "services", "mesh-gateway"),
    npmScript: "test:postman"
  },
  eventprocessor: {
    label: "Event Processor",
    cwd: path.join(root, "services", "event-processor"),
    npmScript: "test:postman"
  },
  processgraph: {
    label: "Process Graph",
    cwd: path.join(root, "services", "process-graph"),
    npmScript: "test:postman"
  },
  integrationhub: {
    label: "Integration Hub",
    cwd: path.join(root, "services", "integration-hub"),
    npmScript: "test:postman"
  },
  navigatorai: {
    label: "Navigator AI",
    cwd: path.join(root, "services", "navigator-ai"),
    npmScript: "test:postman"
  },
  "mesh-p2p": {
    label: "Mesh Gateway P2P Flow",
    cwd: path.join(root, "services", "mesh-gateway"),
    npmScript: "test:p2p:mesh"
  },
  "mesh-o2c": {
    label: "Mesh Gateway O2C Flow",
    cwd: path.join(root, "services", "mesh-gateway"),
    npmScript: "test:o2c:mesh"
  },
  "mesh-r2r": {
    label: "Mesh Gateway R2R Flow",
    cwd: path.join(root, "services", "mesh-gateway"),
    npmScript: "test:r2r:mesh"
  },
  "mesh-h2r": {
    label: "Mesh Gateway H2R Flow",
    cwd: path.join(root, "services", "mesh-gateway"),
    npmScript: "test:h2r:mesh"
  }
};

const allComponents = ["foundation", "authority", "governance", "mesh", "eventprocessor", "processgraph", "integrationhub", "navigatorai"];
const allMeshFlows = ["mesh-p2p", "mesh-o2c", "mesh-r2r", "mesh-h2r"];

function printHelp() {
  console.log("Usage: node postman/newman/run-newman.js <target>");
  console.log("");
  console.log("Targets:");
  console.log("  foundation     Run FoundationERP postman suite");
  console.log("  foundation-projects-r2r-reporting Run focused FoundationERP projects + R2R reporting suite");
  console.log("  authority      Run Authority Engine postman suite");
  console.log("  governance     Run Governance Engine postman suite");
  console.log("  mesh           Run Mesh Gateway postman suite");
  console.log("  eventprocessor Run Event Processor postman suite");
  console.log("  processgraph   Run Process Graph postman suite");
  console.log("  integrationhub Run Integration Hub postman suite");
  console.log("  navigatorai    Run Navigator AI postman suite");
  console.log("  mesh-p2p       Run Mesh Gateway P2P end-to-end flow");
  console.log("  mesh-o2c       Run Mesh Gateway O2C end-to-end flow");
  console.log("  mesh-r2r       Run Mesh Gateway R2R end-to-end flow");
  console.log("  mesh-h2r       Run Mesh Gateway H2R end-to-end flow");
  console.log("  mesh-all       Run all Mesh Gateway domain flows");
  console.log("  all            Run all component postman suites");
}

function runTarget(targetKey) {
  const target = targets[targetKey];
  if (!target) {
    console.error(`Unknown target: ${targetKey}`);
    return 1;
  }

  console.log(`\n==> ${target.label} (${target.npmScript})`);
  const result = spawnSync("npm run " + target.npmScript, {
    cwd: target.cwd,
    stdio: "inherit",
    shell: true
  });

  if (result.error) {
    console.error(`Failed to start target '${targetKey}': ${result.error.message}`);
    return 1;
  }

  if (typeof result.status === "number") {
    return result.status;
  }

  return 1;
}

function runMany(targetKeys) {
  let failed = false;
  for (const key of targetKeys) {
    const code = runTarget(key);
    if (code !== 0) {
      console.error(`\nTarget failed: ${key}`);
      failed = true;
      break;
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("\nAll requested Newman targets completed successfully.");
}

const arg = (process.argv[2] || "").trim().toLowerCase();

if (!arg || arg === "help" || arg === "--help" || arg === "-h") {
  printHelp();
  process.exit(0);
}

if (arg === "all") {
  runMany(allComponents);
  process.exit(0);
}

if (arg === "mesh-all") {
  runMany(allMeshFlows);
  process.exit(0);
}

const singleCode = runTarget(arg);
process.exit(singleCode);
