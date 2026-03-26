import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { runMigrations } from "./db/migrate";

async function main() {
  const config = loadConfig();
  runMigrations();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`mesh-gateway listening on ${config.port}`);
  });
}

main().catch((error) => {
  console.error("mesh-gateway fatal startup error", error);
  process.exit(1);
});
