const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function collectTestFiles(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(fullPath);
    }
  }
}

const projectRoot = process.cwd();
const testRoot = path.join(projectRoot, "test");

if (!fs.existsSync(testRoot)) {
  console.error(`No test directory found at ${testRoot}`);
  process.exit(1);
}

const testFiles = [];
collectTestFiles(testRoot, testFiles);
testFiles.sort();

if (testFiles.length === 0) {
  console.error(`No integration test files found under ${testRoot}`);
  process.exit(1);
}

const args = ["--import", "tsx", "--test", ...testFiles];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
