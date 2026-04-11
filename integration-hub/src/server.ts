import { createApp } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`[integration-hub] listening on :${config.port}`);
});
