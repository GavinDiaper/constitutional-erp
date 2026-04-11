import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { runMigrations } from "./db/migrate";
import { setReplayStatus } from "./projection/runtimeState";

async function main() {
  const config = loadConfig();

  runMigrations();

  // PGE does not replay from a local event store on startup; it reconstructs
  // aggregate state on-demand from the Event Processor. The "Ready" status
  // simply confirms the service and its DB are initialised.
  setReplayStatus("Ready");

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`process-graph listening on port ${config.port}`);
    console.log(`process-graph ready`);
  });
}

main().catch((error) => {
  console.error("process-graph fatal startup error", error);
  process.exit(1);
});
