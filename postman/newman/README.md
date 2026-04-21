# Root Newman Runners

This directory centralizes Newman execution for all ConstitutionalERP components.

## Quick Start (Windows)

- Run the full reset/build/start/test cycle from repo root:
  - `run-full-postman-cycle.cmd`

- Run all component postman suites:
  - `postman\\newman\\run-all.cmd`
- Run a single component:
  - `postman\\newman\\run-foundationerp.cmd`
  - `postman\\newman\\run-foundation-projects-r2r-reporting.cmd`
  - `postman\\newman\\run-authority-engine.cmd`
  - `postman\\newman\\run-governance-engine.cmd`
  - `postman\\newman\\run-mesh-gateway.cmd`
  - `postman\\newman\\run-event-processor.cmd`
  - `postman\\newman\\run-process-graph.cmd`
  - `postman\\newman\\run-integration-hub.cmd`
  - `postman\\newman\\run-navigator-ai.cmd`

## Mesh Domain Flow Runners

- `postman\\newman\\run-mesh-p2p.cmd`
- `postman\\newman\\run-mesh-o2c.cmd`
- `postman\\newman\\run-mesh-r2r.cmd`
- `postman\\newman\\run-mesh-h2r.cmd`
- `postman\\newman\\run-mesh-all.cmd`

## Node Entrypoint

Use the unified Node runner directly:

- `node postman/newman/run-newman.js all`
- `node postman/newman/run-newman.js foundation`
- `node postman/newman/run-newman.js foundation-projects-r2r-reporting`
- `node postman/newman/run-newman.js authority`
- `node postman/newman/run-newman.js governance`
- `node postman/newman/run-newman.js mesh`
- `node postman/newman/run-newman.js eventprocessor`
- `node postman/newman/run-newman.js processgraph`
- `node postman/newman/run-newman.js integrationhub`
- `node postman/newman/run-newman.js navigatorai`
- `node postman/newman/run-newman.js mesh-all`

Each target executes the component's existing npm Newman script in its own project directory.

## Focused FoundationERP Data Set

Use the focused FoundationERP runner when you want a smaller, more meaningful dataset:

- Runs targeted folders for tax setup, financial seeding, projects flow, and MCP bridge validation
- Bootstraps minimal inventory prerequisites for the Projects flow
- Validates MCP coverage for `bom_create_bom` and `inv_issue_to_project`
- Applies clearer project and organization naming
- Exports reports to:
  - `services/foundation-erp/reports/newman/projects-r2r-reporting.results.json`
  - `services/foundation-erp/reports/newman/projects-r2r-reporting.results.xml`

## End-to-End Sequence

From `D:\Projects\ConstitutionalERP`, this command performs the full integration cycle:

- `run-full-postman-cycle.cmd`

Sequence:

1. Stops all apps
2. Clears service data (SQLite reset + migrations)
3. Rebuilds unified Postman assets (`postman/build-unified-postman.js`)
4. Starts all servers
5. Runs all component suites (`all`)
6. Runs all mesh flow suites (`mesh-all`)
