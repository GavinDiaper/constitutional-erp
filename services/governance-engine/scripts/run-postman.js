const path = require("node:path");
const newman = require("newman");

const collection = path.join(__dirname, "..", "postman", "GovernanceEngine.postman_collection.json");
const environment = path.join(__dirname, "..", "postman", "GovernanceEngine.local.postman_environment.json");

newman.run(
  {
    collection,
    environment,
    reporters: ["cli", "junit", "json"],
    reporter: {
      junit: {
        export: path.join(__dirname, "..", "reports", "newman", "results.xml")
      },
      json: {
        export: path.join(__dirname, "..", "reports", "newman", "results.json")
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
