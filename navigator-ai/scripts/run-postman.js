const fs = require("node:fs");
const path = require("node:path");

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

const newman = loadNewman();

const collection = path.join(__dirname, "..", "postman", "NavigatorAI.postman_collection.json");
const environment = path.join(__dirname, "..", "postman", "NavigatorAI.local.postman_environment.json");
const reportDir = path.join(__dirname, "..", "reports", "newman");

fs.mkdirSync(reportDir, { recursive: true });

newman.run(
  {
    collection,
    environment,
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
