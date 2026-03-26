import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { runMigrations } from "./db/migrate";
import { startPollingConsumer } from "./projection/consumer";
import { replayToHead } from "./projection/replay";
import { setReplayStatus } from "./projection/state";

async function main() {
  const config = loadConfig();
  runMigrations();

  setReplayStatus("Replaying");
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`authority-engine listening on ${config.port}`);
  });

  try {
    await replayToHead();
    setReplayStatus("Ready");
    startPollingConsumer(config.pollIntervalMs);
    console.log("authority-engine replay complete; service is ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown replay error";
    setReplayStatus("Failed", message);
    console.error("authority-engine startup replay failed", error);
    server.close(() => {
      process.exit(1);
    });
  }
}

main().catch((error) => {
  console.error("authority-engine fatal startup error", error);
  process.exit(1);
});
