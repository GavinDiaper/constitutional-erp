# Process Graph Engine

Constitutional ERP – Process Graph Engine v1

The Process Graph Engine (PGE) is the canonical state-machine authority for all ERP domains. It owns the allowed-transition graph, evaluates policy (authority + governance) before each transition, and returns hypermedia-linked canonical resources. It never stores aggregate state – state is always reconstructed on demand by replaying events from the Constitutional Event Processor.

## Port

| Service | Port |
|---------|------|
| process-graph | **4005** |

## Prerequisites

- Node 22+ (Node 24 recommended)
- The following services reachable (URLs configurable via env):
  - Constitutional Event Processor (`EVENT_PROCESSOR_URL`)
  - Authority Engine (`AUTHORITY_ENGINE_URL`)
  - Governance Engine (`GOVERNANCE_ENGINE_URL`)
  - Mesh Gateway (`MESH_GATEWAY_URL`, optional — disabled by default)

## Setup

```bash
cp .env.example .env
# Edit .env with real values
npm install
npm run migrate
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4005` | HTTP port |
| `API_KEY` | *(required)* | Inbound API key (`x-api-key` header) |
| `DB_PATH` | `./data/pge.db` | SQLite database path |
| `EVENT_PROCESSOR_URL` | `http://localhost:4004` | CEP base URL |
| `EVENT_PROCESSOR_API_KEY` | *(required)* | API key for CEP |
| `AUTHORITY_ENGINE_URL` | `http://localhost:4001` | Authority Engine base URL |
| `AUTHORITY_ENGINE_API_KEY` | *(required)* | API key for Authority Engine |
| `GOVERNANCE_ENGINE_URL` | `http://localhost:4002` | Governance Engine base URL |
| `GOVERNANCE_ENGINE_API_KEY` | *(required)* | API key for Governance Engine |
| `MESH_GATEWAY_URL` | `http://localhost:4003` | Mesh Gateway base URL |
| `MESH_GATEWAY_API_KEY` | *(required)* | API key for Mesh Gateway |
| `MESH_DELEGATION_ENABLED` | `false` | Enable Mesh delegation on allowed transitions |
| `LOG_LEVEL` | `info` | Log level |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm start` | Start compiled output |
| `npm run migrate` | Run DB migrations |
| `npm run lint` | Type-check (tsc --noEmit) |
| `npm run test:integration` | Run integration tests |
| `npm run test:postman` | Run Postman collection via Newman |

## API

All endpoints (except `/health`) require:
- `x-api-key: <API_KEY>` header

### Health

```
GET /health
```
No authentication required. Returns `{ status: "ok", service: "process-graph" }`.

### Get canonical resource

```
GET /graph/:domain/:aggregateType/:id
Headers: x-api-key, x-actor-id (optional – omit to skip policy evaluation)
```

Returns the current state of an aggregate as a canonical hypermedia resource with available transitions as links. If `x-actor-id` is present, each link is annotated with its policy outcome (`allowed`, `denied`, `requiresApproval`).

**Example:**
```bash
curl http://localhost:4005/graph/p2p/requisition/REQ-001 \
  -H "x-api-key: change-me" \
  -H "x-actor-id: EMP-001"
```

### Execute transition

```
POST /graph/:domain/:aggregateType/:id/:action
Headers: x-api-key, x-actor-id (required), Content-Type: application/json
Body: { ...transitionPayload, projectedState?: string }
```

Evaluates policy and, if allowed, records the command. Returns one of:
- `200` – Transition allowed; body contains the projected canonical resource.
- `202` – Transition requires approval; body contains `{ status: "approval_required", approvalTask: { id, href, requiredTier }, resource }`.
- `403` – Transition denied by policy.
- `404` – Aggregate not found (no events in ledger).
- `422` – Transition not valid from current state.

**Example:**
```bash
curl -X POST http://localhost:4005/graph/p2p/requisition/REQ-001/submit \
  -H "x-api-key: change-me" \
  -H "x-actor-id: EMP-001" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### List pending approvals

```
GET /graph/approvals[?domain=P2P&aggregateType=requisition&aggregateId=REQ-001]
Headers: x-api-key
```

### Get approval task

```
GET /graph/approvals/:taskId
Headers: x-api-key
```

### Resolve approval task

```
POST /graph/approvals/:taskId/resolve
Headers: x-api-key, x-actor-id (required), Content-Type: application/json
Body: { "resolution": "Approved" | "Rejected", "note": "optional" }
```

On `Approved`: re-validates the aggregate hasn't changed, re-evaluates charter with the approver's identity, executes the command, and returns the projected resource. On `Rejected`: marks the task rejected and returns the task record.

## Domain Coverage

| Domain | Aggregate Types |
|--------|----------------|
| P2P | requisition, purchase-order, supplier-invoice, ap-payment |
| O2C | quote, sales-order, ar-invoice, ar-payment |
| R2R | journal-entry, period |
| H2R | employee, leave-request |

## Architecture Notes

- **Replay-on-demand**: PGE contains no aggregate state. On every GET or POST it fetches the event stream from CEP and rebuilds state in memory.
- **Policy pipeline**: Authority Engine checks entitlements → Governance Engine evaluates business rules → combined outcome determines transition path.
- **PGE-owned tables**: `pge_approval_task` and `pge_command_log` (SQLite). No aggregate state tables.
- **Mesh delegation**: Disabled by default. When enabled, allowed transitions are forwarded to Mesh Gateway for downstream execution.
