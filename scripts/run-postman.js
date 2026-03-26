const { mkdirSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const { config } = require("dotenv");

config({ path: resolve(__dirname, "..", ".env"), override: true });

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

const inferredBaseUrl = process.env.PORT ? `http://localhost:${process.env.PORT}` : undefined;

const envOverrides = {
  baseUrl: process.env.POSTMAN_BASE_URL ?? inferredBaseUrl,
  apiKey: process.env.POSTMAN_API_KEY ?? process.env.API_KEY,
  ingressId: process.env.POSTMAN_INGRESS_ID ?? process.env.INGRESS_ID_VALUE
};

Object.entries(envOverrides).forEach(([key, value]) => {
  if (value) {
    args.push("--env-var", `${key}=${value}`);
  }
});

execFileSync(cmd, args, { stdio: "inherit" });
