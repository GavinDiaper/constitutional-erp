const { resolve } = require("node:path");
const { spawn } = require("node:child_process");
const { config } = require("dotenv");

config({ path: resolve(__dirname, "..", ".env"), override: true });

const server = spawn(process.execPath, [resolve(__dirname, "..", "dist", "src", "server.js")], {
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
