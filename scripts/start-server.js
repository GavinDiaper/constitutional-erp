const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawn } = require("node:child_process");

function portFromBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (url.port) {
    return url.port;
  }

  return url.protocol === "https:" ? "443" : "80";
}

function readPostmanPort() {
  const envFile = resolve(__dirname, "..", "postman", "FoundationERP.local.postman_environment.json");
  if (!existsSync(envFile)) {
    return undefined;
  }

  try {
    const environment = JSON.parse(readFileSync(envFile, "utf8"));
    const baseUrl = environment.values?.find((entry) => entry.key === "baseUrl" && entry.enabled !== false)?.value;

    return typeof baseUrl === "string" && baseUrl ? portFromBaseUrl(baseUrl) : undefined;
  } catch (error) {
    console.warn(`Unable to read Postman environment port: ${error.message}`);
    return undefined;
  }
}

if (!process.env.PORT) {
  const postmanPort = readPostmanPort();
  if (postmanPort) {
    process.env.PORT = postmanPort;
  }
}

const server = spawn(process.execPath, [resolve(__dirname, "..", "dist", "server.js")], {
  stdio: "inherit",
  env: process.env
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

server.on("error", (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});