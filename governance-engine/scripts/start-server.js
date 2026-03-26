const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

require("node:child_process").execSync("npm run build", {
  cwd: projectRoot,
  stdio: "inherit"
});

require("node:child_process").execSync("node dist/src/server.js", {
  cwd: projectRoot,
  stdio: "inherit"
});
