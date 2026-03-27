import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { runMigrations } from "./db/migrate";
import { startPollingConsumer } from "./projection/consumer";
import { replayToHead } from "./projection/replay";
import { setReplayStatus } from "./projection/runtimeState";

async function main() {
  const config = loadConfig();
  runMigrations();

  setReplayStatus("Replaying");
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`event-processor listening on ${config.port}`);
  });

  try {
    await replayToHead();
    setReplayStatus("Ready");
    startPollingConsumer(config.pollIntervalMs);
    console.log("event-processor replay complete; service is ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown replay error";
    setReplayStatus("Failed", message);
    console.error("event-processor startup replay failed", error);
    server.close(() => {
      process.exit(1);
    });
  }
}

main().catch((error) => {
  console.error("event-processor fatal startup error", error);
  process.exit(1);
});