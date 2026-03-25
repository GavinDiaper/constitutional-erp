const { mkdirSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

mkdirSync("reports/newman", { recursive: true });

const cmd = process.execPath;
const args = [
  "node_modules/newman/bin/newman.js",
  "run",
  "postman/FoundationERP.postman_collection.json",
  "-e",
  "postman/FoundationERP.local.postman_environment.json",
  "--reporters",
  "cli,json,junit",
  "--reporter-json-export",
  "reports/newman/results.json",
  "--reporter-junit-export",
  "reports/newman/results.xml",
  "--bail"
];

const envOverrides = {
  baseUrl: process.env.POSTMAN_BASE_URL,
  apiKey: process.env.POSTMAN_API_KEY,
  ingressId: process.env.POSTMAN_INGRESS_ID
};

Object.entries(envOverrides).forEach(([key, value]) => {
  if (value) {
    args.push("--env-var", `${key}=${value}`);
  }
});

execFileSync(cmd, args, { stdio: "inherit" });
