import { createApp } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();
const app = createApp();

app.listen(config.port, () => {
  console.log(`user-identity listening on ${config.port}`);
  console.log("Note: TLS termination is expected at ingress/reverse proxy.");
});
