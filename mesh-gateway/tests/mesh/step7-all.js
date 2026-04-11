#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const scripts = ["step7-p2p.js", "step7-o2c.js", "step7-r2r.js", "step7-h2r.js"];

for (const scriptName of scripts) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, "..", ".."),
    stdio: "inherit",
    env: process.env
  });

  if (typeof result.status !== "number" || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}