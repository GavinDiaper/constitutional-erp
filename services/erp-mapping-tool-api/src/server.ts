import { createApp } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();
const app = createApp();

app.listen(config.port, () => {
  console.log(`erp-mapping-tool-api listening on ${config.port}`);
});
