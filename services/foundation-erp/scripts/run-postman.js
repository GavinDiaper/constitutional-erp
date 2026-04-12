const { mkdirSync, existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const { config } = require("dotenv");

const serviceRoot = resolve(__dirname, "..");

[
  resolve(serviceRoot, ".env"),
  resolve(serviceRoot, ".env.example")
].forEach((envPath) => {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
});

mkdirSync("reports/newman", { recursive: true });

async function assertFoundationErpEndpoint(baseUrl, envOverrides) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const healthUrl = `${normalizedBaseUrl}/health`;

  let healthResponse;
  try {
    healthResponse = await fetch(healthUrl);
  } catch (error) {
    throw new Error(
      `Unable to reach ${healthUrl}. Ensure FoundationERP is running and POSTMAN_BASE_URL is correct. ${error.message}`
    );
  }

  if (!healthResponse.ok) {
    throw new Error(
      `Health check failed at ${healthUrl} with status ${healthResponse.status}. Ensure POSTMAN_BASE_URL targets FoundationERP.`
    );
  }

  let healthBody;
  try {
    healthBody = await healthResponse.json();
  } catch {
    throw new Error(`Health check at ${healthUrl} returned non-JSON content. Ensure POSTMAN_BASE_URL targets FoundationERP.`);
  }

  if (healthBody?.service !== "foundation-erp") {
    throw new Error(
      `Health endpoint at ${healthUrl} returned service='${healthBody?.service ?? "unknown"}'. Expected service='foundation-erp'.`
    );
  }

  const r2rProbeUrl = `${normalizedBaseUrl}/api/v1/r2r/accounts/segment-definitions`;
  const r2rProbeResponse = await fetch(r2rProbeUrl, {
    method: "GET",
    headers: {
      "x-api-key": envOverrides.apiKey,
      "x-ingress-id": envOverrides.ingressId
    }
  });

  if (!r2rProbeResponse.ok) {
    const contentType = r2rProbeResponse.headers.get("content-type") ?? "unknown";
    throw new Error(
      `Preflight probe failed at ${r2rProbeUrl} with status ${r2rProbeResponse.status} (${contentType}). ` +
        "Check API_KEY, ingress id, and ensure this base URL is FoundationERP."
    );
  }
}

const cmd = process.execPath;
const newmanBin = require.resolve("newman/bin/newman.js");
const args = [
  newmanBin,
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

function isLocalBaseUrl(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

const resolvedBaseUrl = process.env.POSTMAN_BASE_URL ?? "http://localhost:3000";
const useLocalDefaults = resolvedBaseUrl ? isLocalBaseUrl(resolvedBaseUrl) : false;

const envOverrides = {
  baseUrl: resolvedBaseUrl,
  apiKey: process.env.POSTMAN_API_KEY ?? (useLocalDefaults ? "change-me" : process.env.API_KEY),
  ingressId:
    process.env.POSTMAN_INGRESS_ID ?? (useLocalDefaults ? "foundation-ingress" : process.env.INGRESS_ID_VALUE)
};

if (!envOverrides.baseUrl) {
  throw new Error("Unable to infer baseUrl. Set POSTMAN_BASE_URL or PORT in environment.");
}

if (!envOverrides.apiKey || !envOverrides.ingressId) {
  throw new Error(
    "Missing apiKey or ingressId for Postman run. Set POSTMAN_API_KEY/POSTMAN_INGRESS_ID or API_KEY/INGRESS_ID_VALUE. " +
      "Local defaults are applied only when POSTMAN_BASE_URL points to localhost."
  );
}

Object.entries(envOverrides).forEach(([key, value]) => {
  if (value) {
    args.push("--env-var", `${key}=${value}`);
  }
});

assertFoundationErpEndpoint(envOverrides.baseUrl, envOverrides)
  .then(() => {
    execFileSync(cmd, args, { stdio: "inherit" });
  })
  .catch((error) => {
    console.error(`Postman preflight failed: ${error.message}`);
    process.exit(1);
  });
