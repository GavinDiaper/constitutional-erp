#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");

const SUITES = [
  { name: "P2P", script: path.join(__dirname, "run-p2p.js") },
  { name: "O2C", script: path.join(__dirname, "run-o2c.js") },
  { name: "R2R", script: path.join(__dirname, "run-r2r.js") },
  { name: "H2R", script: path.join(__dirname, "run-h2r.js") }
];

function runSuite(suite) {
  console.log(`\n=== Running ${suite.name} suite ===`);

  const started = Date.now();
  const result = spawnSync(process.execPath, [suite.script], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });
  const durationMs = Date.now() - started;

  return {
    name: suite.name,
    exitCode: typeof result.status === "number" ? result.status : 1,
    durationMs
  };
}

const results = [];

for (const suite of SUITES) {
  const result = runSuite(suite);
  results.push(result);

  if (result.exitCode !== 0) {
    console.error(`\n${suite.name} suite failed with exit code ${result.exitCode}. Stopping full-suite run.`);
    break;
  }
}

console.log("\n=== Mesh Full Suite Summary ===");
for (const result of results) {
  const status = result.exitCode === 0 ? "PASSED" : "FAILED";
  console.log(`- ${result.name}: ${status} (${result.durationMs} ms)`);
}

const allPassed = results.length === SUITES.length && results.every((result) => result.exitCode === 0);
if (!allPassed) {
  process.exit(1);
}

console.log("\nAll mesh domain suites passed.");
