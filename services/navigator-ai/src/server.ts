import { createApp, navigatorDependencies } from "./app";
import { loadConfig } from "./config/env";
import { runMigrations } from "./db/migrate";
import { setStartupStatus } from "./domain/runtimeState";

async function main() {
  const config = loadConfig();
  runMigrations();

  setStartupStatus("Booting");
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`navigator-ai listening on ${config.port}`);
  });

  try {
    await navigatorDependencies.llmClient.validateConnectivity();
    setStartupStatus("Ready");
    console.log("navigator-ai startup checks complete; service is ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    setStartupStatus("Failed", message);
    console.error("navigator-ai startup failed", error);
    server.close(() => {
      process.exit(1);
    });
  }
}

main().catch((error) => {
  console.error("navigator-ai fatal startup error", error);
  process.exit(1);
});
