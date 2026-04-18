#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const runtimeDir = path.join(__dirname, ".runtime");
const logsDir = path.join(__dirname, "logs");
const statePath = path.join(runtimeDir, "services-state.json");
const productionMode = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
const publicServiceName = process.env.RENDER_PUBLIC_SERVICE || (process.env.RENDER ? "ui-sveltekit" : "");
const defaultTimeoutSeconds = Number.parseInt(process.env.START_ALL_TIMEOUT_SECONDS ?? "180", 10);

const orchestrationEnvDefaults = {
  API_KEY: "change-me",
  FOUNDATION_ERP_API_KEY: "change-me",
  AUTHORITY_ENGINE_API_KEY: "change-me",
  GOVERNANCE_ENGINE_API_KEY: "change-me",
  EVENT_PROCESSOR_API_KEY: "change-me",
  MESH_GATEWAY_API_KEY: "change-me",
  PGE_API_KEY: "change-me",
  INTEGRATION_HUB_API_KEY: "change-me",
  FOUNDATION_ADAPTER_API_KEY: "change-me",
  ADAPTER_API_KEY: "change-me"
};

const serviceTemplates = [
  {
    name: "foundation-erp",
    relativePath: path.join("services", "foundation-erp"),
    defaultPort: 3000,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "authority-engine",
    relativePath: path.join("services", "authority-engine"),
    defaultPort: 4001,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "governance-engine",
    relativePath: path.join("services", "governance-engine"),
    defaultPort: 4002,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "mesh-gateway",
    relativePath: path.join("services", "mesh-gateway"),
    defaultPort: 4003,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "event-processor",
    relativePath: path.join("services", "event-processor"),
    defaultPort: 4004,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "process-graph",
    relativePath: path.join("services", "process-graph"),
    defaultPort: 4005,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "integration-hub",
    relativePath: path.join("services", "integration-hub"),
    defaultPort: 4017,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "user-identity",
    relativePath: path.join("services", "user-identity"),
    defaultPort: 4008,
    startCommand: "node scripts/start-server.js"
  },
  {
    name: "user-identity-app",
    relativePath: path.join("apps", "user-identity"),
    defaultPort: 4174,
    healthPath: "/",
    devCommand: "npm run dev -- --host 127.0.0.1 --port {port}",
    startCommand: "npm run start"
  },
  {
    name: "ui-sveltekit",
    relativePath: path.join("apps", "ui-sveltekit"),
    defaultPort: 4173,
    healthPath: "/",
    devCommand: "npm run dev -- --host 127.0.0.1 --port {port}",
    startCommand: "npm run start"
  },
  {
    name: "navigator-ai",
    relativePath: path.join("services", "navigator-ai"),
    defaultPort: 4016,
    startCommand: "node scripts/start-server.js"
  }
];

function ensureDirectories() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const action = args[0] ?? "start";
  const killPorts = args.includes("--killports") || args.includes("-KillPorts") || args.includes("killports");
  const timeoutIndex = args.findIndex((value) => value === "--timeout" || value === "-TimeoutSeconds");
  const timeoutSeconds = timeoutIndex >= 0 ? Number.parseInt(args[timeoutIndex + 1] ?? `${defaultTimeoutSeconds}`, 10) : defaultTimeoutSeconds;

  return {
    action,
    killPorts,
    timeoutSeconds: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : defaultTimeoutSeconds
  };
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }

  return entries;
}

function getServiceEnvMap(servicePath) {
  const envPath = path.join(servicePath, ".env");
  const fallbackPath = path.join(servicePath, ".env.example");
  if (fs.existsSync(envPath)) {
    return parseEnvFile(envPath);
  }
  if (fs.existsSync(fallbackPath)) {
    return parseEnvFile(fallbackPath);
  }
  return {};
}

function getPackageScripts(servicePath) {
  const packagePath = path.join(servicePath, "package.json");
  if (!fs.existsSync(packagePath)) {
    return {};
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  return pkg.scripts ?? {};
}

function resolveService(template) {
  const servicePath = path.join(repoRoot, template.relativePath);
  const envMap = { ...orchestrationEnvDefaults, ...getServiceEnvMap(servicePath) };
  const packageScripts = getPackageScripts(servicePath);
  const configuredPort = envMap.PORT && /^\d+$/.test(envMap.PORT) ? Number.parseInt(envMap.PORT, 10) : template.defaultPort;
  const shouldUseRenderPort = Boolean(publicServiceName) && publicServiceName === template.name && process.env.PORT;
  const port = shouldUseRenderPort ? Number.parseInt(process.env.PORT, 10) : configuredPort;
  const selectedCommand = productionMode && packageScripts.start
    ? (template.startCommand ?? "npm run start")
    : (template.devCommand ?? "npm run dev");

  return {
    name: template.name,
    path: servicePath,
    port,
    healthPath: template.healthPath ?? "/health",
    healthUrl: `http://127.0.0.1:${port}${template.healthPath ?? "/health"}`,
    command: selectedCommand.replaceAll("{port}", String(port)),
    envMap: {
      ...envMap,
      PORT: String(port)
    },
    publicPort: shouldUseRenderPort
  };
}

function getServices() {
  return serviceTemplates.map(resolveService);
}

function loadState() {
  if (!fs.existsSync(statePath)) {
    return {};
  }

  const raw = fs.readFileSync(statePath, "utf8").trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw);
  return Object.fromEntries((parsed.services ?? []).map((entry) => [entry.name, entry]));
}

function saveState(stateMap) {
  ensureDirectories();
  const services = Object.keys(stateMap).sort().map((name) => ({ name, ...stateMap[name] }));
  fs.writeFileSync(statePath, `${JSON.stringify({ services }, null, 2)}\n`);
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finalize = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finalize(true));
    socket.once("error", () => finalize(false));
    socket.once("timeout", () => finalize(false));
  });
}

async function waitForPort(port, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await canConnect(port)) {
      return true;
    }
    await sleep(1000);
  }
  return false;
}

function readLogTail(filePath, lineCount = 20) {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  return lines.slice(Math.max(lines.length - lineCount, 0)).join("\n").trim();
}

function killProcessTree(pid) {
  if (!pid || !isProcessAlive(pid)) {
    return;
  }

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
}

async function stopTrackedProcess(pid) {
  if (!pid || !isProcessAlive(pid)) {
    return;
  }

  killProcessTree(pid);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await sleep(250);
  }

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    process.kill(pid, "SIGKILL");
  }
}

async function startOneService(service, state, timeoutSeconds, killPorts) {
  if (!fs.existsSync(service.path)) {
    throw new Error(`Service path not found for ${service.name}: ${service.path}`);
  }

  const tracked = state[service.name];
  if (tracked?.pid && isProcessAlive(tracked.pid)) {
    console.log(`[skip] ${service.name} already running (pid ${tracked.pid})`);
    return;
  }

  if (await canConnect(service.port)) {
    if (!killPorts || !tracked?.pid) {
      throw new Error(`Port ${service.port} is already in use before starting ${service.name}.`);
    }
    await stopTrackedProcess(tracked.pid);
  }

  ensureDirectories();
  const stdoutPath = path.join(logsDir, `${service.name}.out.log`);
  const stderrPath = path.join(logsDir, `${service.name}.err.log`);
  const stdoutFd = fs.openSync(stdoutPath, "a");
  const stderrFd = fs.openSync(stderrPath, "a");

  console.log(`[start] ${service.name}${service.publicPort ? ` on public port ${service.port}` : ""}`);
  const child = spawn(service.command, {
    cwd: service.path,
    env: { ...process.env, ...service.envMap },
    shell: true,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd]
  });

  child.unref();
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  const ready = await waitForPort(service.port, timeoutSeconds);
  if (!ready) {
    await stopTrackedProcess(child.pid);
    const tail = readLogTail(stderrPath);
    throw new Error(`Timed out waiting for ${service.name} on port ${service.port}.${tail ? ` Last stderr lines:\n${tail}` : ""}`);
  }

  state[service.name] = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    stdout: stdoutPath,
    stderr: stderrPath,
    port: service.port
  };

  console.log(`[ready] ${service.name} listening on ${service.port} (pid ${child.pid})`);
}

async function stopOneService(service, state) {
  const tracked = state[service.name];
  if (!tracked?.pid) {
    console.log(`[skip] ${service.name} was not running`);
    return;
  }

  console.log(`[stop] ${service.name} (pid ${tracked.pid})`);
  await stopTrackedProcess(tracked.pid);
  delete state[service.name];
}

function reverseServices(services) {
  return [...services].reverse();
}

async function showStatus(services, state) {
  for (const service of services) {
    const trackedPid = state[service.name]?.pid ?? "";
    const trackedAlive = trackedPid ? isProcessAlive(trackedPid) : false;
    const listening = await canConnect(service.port);
    console.log(`${service.name}\tport=${service.port}\ttrackedPid=${trackedPid}\ttrackedAlive=${trackedAlive}\tlistening=${listening}`);
  }
}

async function showHealth(services) {
  let allHealthy = true;

  for (const service of services) {
    let httpCode = "";
    let status = "";
    let replayStatus = "";
    let healthy = false;
    let error = "";

    try {
      const response = await fetch(service.healthUrl, { method: "GET" });
      httpCode = String(response.status);
      healthy = response.status === 200;
      const text = await response.text();
      if (text) {
        try {
          const payload = JSON.parse(text);
          status = payload.status ?? "";
          replayStatus = payload.replayStatus ?? "";
          if (status) {
            healthy = healthy && status === "ok";
          }
          if (replayStatus) {
            healthy = healthy && replayStatus === "Ready";
          }
        } catch {
          status = "";
        }
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    allHealthy = allHealthy && healthy;
    console.log(`${service.name}\tport=${service.port}\thttp=${httpCode}\tstatus=${status}\treplay=${replayStatus}\thealthy=${healthy}\terror=${error}`);
  }

  console.log(allHealthy ? "All services healthy." : "One or more services are unhealthy.");
  if (!allHealthy) {
    process.exitCode = 1;
  }
}

async function main() {
  const { action, killPorts, timeoutSeconds } = parseArgs(process.argv);
  const services = getServices();
  const state = loadState();

  switch (action) {
    case "start":
      for (const service of services) {
        await startOneService(service, state, timeoutSeconds, killPorts);
        saveState(state);
      }
      break;
    case "stop":
      for (const service of reverseServices(services)) {
        await stopOneService(service, state);
        saveState(state);
      }
      break;
    case "restart":
      for (const service of reverseServices(services)) {
        await stopOneService(service, state);
        saveState(state);
      }
      for (const service of services) {
        await startOneService(service, state, timeoutSeconds, killPorts);
        saveState(state);
      }
      break;
    case "status":
      await showStatus(services, state);
      break;
    case "health":
      await showHealth(services);
      break;
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});