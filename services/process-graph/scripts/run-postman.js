const path = require("node:path");
const fs = require("node:fs");
const newman = require("newman");

const projectRoot = path.join(__dirname, "..");
const reportsDir = path.join(projectRoot, "reports", "newman");

fs.mkdirSync(reportsDir, { recursive: true });

newman.run(
  {
    collection: require(path.join(projectRoot, "postman", "ProcessGraph.postman_collection.json")),
    environment: require(path.join(projectRoot, "postman", "ProcessGraph.local.postman_environment.json")),
    reporters: ["cli", "junit", "json"],
    reporter: {
      junit: {
        export: path.join(reportsDir, "results.xml")
      },
      json: {
        export: path.join(reportsDir, "results.json")
      }
    }
  },
  (error, summary) => {
    if (error) {
      console.error("process-graph postman run failed", error);
      process.exit(1);
      return;
    }

    if (summary.run.failures.length > 0) {
      console.error("process-graph postman run reported failures");
      process.exit(1);
      return;
    }

    console.log("process-graph postman run completed successfully");
  }
);
