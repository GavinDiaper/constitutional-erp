const path = require("node:path");
const { execSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");

execSync("npm run build", {
  cwd: projectRoot,
  stdio: "inherit"
});

execSync("node dist/src/server.js", {
  cwd: projectRoot,
  stdio: "inherit"
});
