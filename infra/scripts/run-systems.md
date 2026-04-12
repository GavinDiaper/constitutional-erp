# Run Systems Tool

This document describes the root orchestration tool for starting and stopping the ConstitutionalERP services in a controlled order.

## Files

- `run-systems.ps1`: main PowerShell orchestrator
- `run-systems.cmd`: convenience wrapper for Windows shells
- `run-full-postman-cycle.ps1`: end-to-end stop/reset/build/start/test orchestrator
- `run-full-postman-cycle.cmd`: convenience wrapper for full-cycle runner
- `run-docker-postman-cycle.ps1`: Docker Compose rebuild and retest orchestrator
- `run-docker-postman-cycle.cmd`: convenience wrapper for Docker rebuild and retest
- `truncate-logs.ps1`: truncates log files without deleting them
- `truncate-logs.cmd`: convenience wrapper for log truncation

## Managed services

1. Foundation ERP (`3000`)
2. Authority Engine (`4001`)
3. Governance Engine (`4002`)
4. Mesh Gateway (`4003`)
5. Event Processor (`4004`)
6. Process Graph (`4005`)
7. Integration Hub (`4017`)
8. Navigator AI (`4016`)

Startup order follows the list above.
Shutdown order is reversed.

## Commands

Run from `D:\Projects\ConstitutionalERP`:

```powershell
.\run-systems.cmd start
.\run-systems.cmd stop
.\run-systems.cmd restart
.\run-systems.cmd status
.\run-systems.cmd health
.\run-systems.cmd killports
.\run-systems.cmd resetdb
.\run-full-postman-cycle.cmd
.\run-docker-postman-cycle.cmd
.\truncate-logs.cmd
```

## Truncate logs

Use this to clear large log files while keeping the log files themselves:

```powershell
.\truncate-logs.cmd
```

Optional flags:

- `-Path <path>`: target folder to search (default `logs`)
- `-Pattern <glob>`: filename pattern (default `*.log`)
- `-Recurse`: include subfolders under the target path

Examples:

```powershell
.\truncate-logs.cmd -Path logs -Pattern *.log
.\truncate-logs.cmd -Path logs -Recurse
```

## Full Postman cycle

Use this to run the complete workflow in one command:

1. Stop all services
2. Reset all SQLite data and rerun migrations
3. Rebuild unified Postman collection and environment
4. Start all services
5. Run all component Newman suites
6. Run all mesh domain flow suites

```powershell
.\run-full-postman-cycle.cmd
```

Optional flags:

- `-KillPorts`: pass through to service lifecycle actions to clear managed ports
- `-TimeoutSeconds <n>`: service startup timeout used by start/reset stages
- `-SkipMeshFlows`: run component suites only
- `-SkipHealthCheck`: skip pre-suite health stage
- `-UseExistingServices`: do not stop, reset, or start local services; run against already running endpoints such as Docker-published ports

Example:

```powershell
.\run-full-postman-cycle.cmd -KillPorts -TimeoutSeconds 90
.\run-full-postman-cycle.cmd -UseExistingServices
```

## Docker rebuild and retest

Use this when the stack runs in Docker Compose and you want one command to rebuild, restart, health-check, and run Newman against the published localhost ports:

```powershell
.\run-docker-postman-cycle.cmd
```

Optional flags:

- `-SkipBuild`: restart existing images without rebuilding
- `-SkipPostman`: rebuild and health-check only
- `-SkipMeshFlows`: run component suites only
- `-SkipHealthCheck`: skip localhost health verification
- `-TimeoutSeconds <n>`: timeout passed through to the localhost health/Newman cycle
- `-ComposeFile <path>`: alternate compose file
- `-ComposeEnvFile <path>`: alternate compose env file

Examples:

```powershell
.\run-docker-postman-cycle.cmd -SkipPostman
.\run-docker-postman-cycle.cmd -SkipBuild -SkipMeshFlows
```

## Options

- `-KillPorts`: force-kill listeners on managed ports during start/stop/restart
- `-TimeoutSeconds <n>`: startup wait timeout per service (default `60`)

Example:

```powershell
.\run-systems.cmd start -KillPorts -TimeoutSeconds 90
```

## What each action does

- `start`: starts all services in dependency order, waits for port bind, tracks PIDs
- `stop`: stops tracked services in reverse order
- `restart`: stop then start
- `status`: shows tracked PID/alive/listening-port view
- `health`: calls each `/health` endpoint and shows a health matrix
- `killports`: kills any process listening on `3000`, `4001`, `4002`, `4003`, `4004`, `4005`, `4016`, `4017`
- `resetdb`: stops services, kills managed ports, removes SQLite files (`.db`, `-wal`, `-shm`) for all managed services, then runs `npm run migrate` for each service

## Runtime artifacts

- State file: `.runtime/services-state.json`
- Logs directory: `logs/`
  - `<service>.out.log`
  - `<service>.err.log`

## Notes

- The tool uses `npm run dev` for each service.
- `run-full-postman-cycle` defaults to the same local-process model. Use `-UseExistingServices` when the stack is already running elsewhere, for example via Docker.
- The default local and Docker examples intentionally use `API_KEY=change-me` for all internal service hops and Postman environments. That value must match across the running services and the Newman environment unless you deliberately override it everywhere.
- The tool resolves config from each service env file in this order: `.env`, then `.env.example`.
- The tool exports those resolved env values into each launched process to prevent global shell env collisions (for example global `PORT` or `API_KEY`).
- If a port is already occupied and `-KillPorts` is not set, `start` fails with a clear message.
- `health` marks a service healthy when HTTP is `200`; if payload fields exist, `status` should be `ok` and `replayStatus` should be `Ready`.
- Navigator AI performs fail-fast startup validation for Azure OpenAI connectivity; if required Azure settings are missing or unreachable, Navigator AI will fail startup by design.
