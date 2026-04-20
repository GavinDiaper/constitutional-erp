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

// Pre-step folders: tax configuration setup (run first)
const FOLDER_R2R_FY2025_CARRY_FORWARD = "30 - R2R FY2025 Carry Forward";
const FOLDER_R2R_TAX_CONFIG = "31 - R2R Tax Config";
const FOLDER_O2C_UAE_VAT = "11 - O2C Flow UAE VAT (VAT5)";
const FOLDER_P2P_UAE_VAT = "21 - P2P Flow UAE VAT (VAT5)";
const FOLDER_P2P_UAE_RC = "22 - P2P Flow UAE Reverse Charge (RC5)";

// Main test folders (run after tax config)
const FOLDER_R2R_SEEDING = "31 - R2R Financial Seeding";
const FOLDER_PROJECTS_FLOW = "41 - Projects Flow";

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

function isLocalBaseUrl(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

function headers(apiKey, ingressId) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "x-ingress-id": ingressId
  };
}

async function bootstrapProjectsPrereqs(baseUrl, apiKey, ingressId, runId) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const skuCode = `SKU-PROJ-REPORT-${runId}`;
  const organizationName = `Projects Reporting Org ${runId}`;

  const createSkuResponse = await fetch(`${normalizedBaseUrl}/api/v1/inv/skus`, {
    method: "POST",
    headers: headers(apiKey, ingressId),
    body: JSON.stringify({
      skuCode,
      description: "Focused reporting run SKU",
      category: "Reporting",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 12.5
    })
  });

  if (!createSkuResponse.ok) {
    const bodyText = await createSkuResponse.text();
    throw new Error(`Failed to create focused-run SKU (status ${createSkuResponse.status}): ${bodyText}`);
  }

  const skuBody = await createSkuResponse.json();
  const invSkuId = skuBody?.sku_id;
  if (!invSkuId) {
    throw new Error("Focused-run SKU creation response did not include sku_id.");
  }

  const createOrgResponse = await fetch(`${normalizedBaseUrl}/api/v1/inv/organizations`, {
    method: "POST",
    headers: headers(apiKey, ingressId),
    body: JSON.stringify({
      name: organizationName
    })
  });

  if (!createOrgResponse.ok) {
    const bodyText = await createOrgResponse.text();
    throw new Error(`Failed to create focused-run inventory organization (status ${createOrgResponse.status}): ${bodyText}`);
  }

  const orgBody = await createOrgResponse.json();
  const invOrganizationId = orgBody?.organization_id;
  if (!invOrganizationId) {
    throw new Error("Focused-run inventory organization response did not include organization_id.");
  }

  return {
    invSkuId,
    invOrganizationId,
    skuCode,
    organizationName
  };
}

const cmd = process.execPath;
const newmanBin = require.resolve("newman/bin/newman.js");

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

const runId = String(Date.now());

assertFoundationErpEndpoint(envOverrides.baseUrl, envOverrides)
  .then(async () => {
    const projectPrereqs = await bootstrapProjectsPrereqs(
      envOverrides.baseUrl,
      envOverrides.apiKey,
      envOverrides.ingressId,
      runId
    );

    const args = [
      newmanBin,
      "run",
      "postman/FoundationERP.postman_collection.json",
      "-e",
      "postman/FoundationERP.local.postman_environment.json",
      // Pre-step: prior-year carry forward and tax configuration setup
      "--folder",
      FOLDER_R2R_FY2025_CARRY_FORWARD,
      "--folder",
      FOLDER_R2R_TAX_CONFIG,
      "--folder",
      FOLDER_O2C_UAE_VAT,
      "--folder",
      FOLDER_P2P_UAE_VAT,
      "--folder",
      FOLDER_P2P_UAE_RC,
      // Main test folders
      "--folder",
      FOLDER_R2R_SEEDING,
      "--folder",
      FOLDER_PROJECTS_FLOW,
      "--reporters",
      "cli,json,junit",
      "--reporter-json-export",
      "reports/newman/projects-r2r-reporting.results.json",
      "--reporter-junit-export",
      "reports/newman/projects-r2r-reporting.results.xml",
      "--disable-unicode",
      "--bail"
    ];

    const focusedEnv = {
      collectionInitialized: "true",
      bakedBreadRunId: runId,
      invSkuId: projectPrereqs.invSkuId,
      invOrganizationId: projectPrereqs.invOrganizationId,
      invSkuCode: projectPrereqs.skuCode,
      invOrganizationName: projectPrereqs.organizationName,
      projectName: `Projects Reporting Seed ${runId}`,
      cancelProjectName: `Projects Reporting Cancel ${runId}`,
      bomRevision: `PRJ-R${runId}`
    };

    Object.entries(envOverrides).forEach(([key, value]) => {
      if (value) {
        args.push("--env-var", `${key}=${value}`);
      }
    });

    Object.entries(focusedEnv).forEach(([key, value]) => {
      args.push("--env-var", `${key}=${value}`);
    });

    const output = execFileSync(cmd, args, {
      stdio: "pipe",
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });

    if (output) {
      process.stdout.write(output);
    }
  })
  .catch((error) => {
    if (error?.stdout) {
      process.stdout.write(error.stdout);
    }
    if (error?.stderr) {
      process.stderr.write(error.stderr);
    }
    console.error(`Focused Postman run failed: ${error.message}`);
    process.exit(1);
  });
