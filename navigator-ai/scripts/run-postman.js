const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function loadLocalEnv() {
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", ".env.example")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      return;
    }
  }
}

function resolveBaseUrl() {
  const explicitBaseUrl = process.env.POSTMAN_BASE_URL ?? process.env.NAVIGATOR_BASE_URL;
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const port = Number(process.env.PORT ?? 4016);
  return `http://localhost:${port}`;
}

async function preflightHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health endpoint returned HTTP ${response.status}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Navigator AI is not reachable at ${baseUrl}. Start the service first (for example, run-systems.cmd start or npm run dev in navigator-ai). Details: ${reason}`
    );
  }
}

function loadNewman() {
  const candidatePaths = [
    path.join(__dirname, "..", "node_modules", "newman"),
    path.join(__dirname, "..", "..", "integration-hub", "node_modules", "newman"),
    path.join(__dirname, "..", "..", "process-graph", "node_modules", "newman"),
    path.join(__dirname, "..", "..", "mesh-gateway", "node_modules", "newman"),
    path.join(__dirname, "..", "..", "authority-engine", "node_modules", "newman"),
    path.join(__dirname, "..", "..", "governance-engine", "node_modules", "newman")
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return require(candidatePath);
    }
  }

  throw new Error(
    `Unable to resolve 'newman' from Navigator AI or sibling services. Checked: ${candidatePaths.join(", ")}`
  );
}

async function main() {
  loadLocalEnv();

  const newman = loadNewman();
  const baseUrl = resolveBaseUrl();
  const collection = path.join(__dirname, "..", "postman", "NavigatorAI.postman_collection.json");
  const environment = path.join(__dirname, "..", "postman", "NavigatorAI.local.postman_environment.json");
  const reportDir = path.join(__dirname, "..", "reports", "newman");

  await preflightHealth(baseUrl);

  fs.mkdirSync(reportDir, { recursive: true });

  newman.run(
    {
      collection,
      environment,
      envVar: [{ key: "baseUrl", value: baseUrl }],
      reporters: ["cli", "junit", "json"],
      reporter: {
        junit: {
          export: path.join(reportDir, "results.xml")
        },
        json: {
          export: path.join(reportDir, "results.json")
        }
      }
    },
    (err) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    }
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
