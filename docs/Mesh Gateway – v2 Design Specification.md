# 📘 Mesh Gateway – v2 Design Specification (ERP‑agnostic)

### *Constitutional Layer – Hypermedia Filtering, Execution Validation, and Orchestration*  
### *Node.js + TypeScript – Adapter‑based, ERP‑agnostic*

---

## 1. Purpose

The Mesh Gateway is the **constitutional enforcement point** that sits between all clients (Navigator, UI, Integration Hub) and **any backend system that exposes business transitions**.

Its job is to ensure that **every read and every write** is:

- **authority‑checked**  
- **governance‑checked**  
- **hypermedia‑filtered**  
- **explainable**  
- **deterministic**  
- **constitutional**  

The Mesh is the **only** component that clients talk to for business transitions.  
Backends (Foundation ERP, SAP, Oracle, etc.) are accessed via **adapters**.

---

## 2. Responsibilities

- **Proxy constitutional requests:**
  - **GET** resource hypermedia (canonicalized via adapters)
  - **POST** action execution
  - **Approval workflow endpoints**

- **Filter hypermedia responses:**
  - Remove or annotate transitions based on:
    - authority  
    - governance  
    - SoD  
    - risk  
    - credentials  
    - charter rules  

- **Validate all execution requests:**
  1. Call Authority Engine  
  2. Call Governance Engine  
  3. Enforce approvals  
  4. Enforce escalations  
  5. Enforce SoD  
  6. Enforce risk constraints  

- **Route approval workflows:**
  - When Governance returns `requiresApproval` or `escalatedToTier`, Mesh:
    - resolves eligible approvers (via Authority Engine)  
    - creates approval tasks  
    - waits for approval  
    - re‑evaluates governance  
    - executes the action if approved  

- **Emit constitutional events:**
  - `MeshActionAllowed`  
  - `MeshActionDenied`  
  - `MeshHypermediaFiltered`  
  - `MeshApprovalTaskCreated`  
  - `MeshApprovalCompleted`  

- **Remain stateless and ERP‑agnostic:**
  - No projections  
  - No replay  
  - No backend‑specific logic in core Mesh—only in adapters  

---

## 3. Architecture overview

```text
Client (Navigator / UI / Integration Hub)
        │
        ▼
Mesh Gateway (ERP‑agnostic)
   - Hypermedia filter
   - Execution validator
   - Approval workflow
   - Adapter router
        │
        ├── Foundation ERP adapter
        ├── SAP adapter (future)
        ├── Oracle adapter (future)
        ├── Other adapters (future)
        │
        ├── Authority Engine (/authority/check, /authority/eligible-approvers)
        └── Governance Engine (/governance/evaluate)
```

---

## 4. Adapter framework design

### 4.1 Goals

- **ERP‑agnostic Mesh core**  
- **Pluggable backend adapters**  
- **Canonical hypermedia and actions**  
- **Clear mapping boundaries**

### 4.2 Adapter responsibilities

Each adapter is responsible for a **single backend system** and must:

- **Translate canonical Mesh routes → backend routes**
- **Call the backend API**
- **Map backend hypermedia → canonical hypermedia**
- **Map backend errors → canonical errors**
- **Expose a small, consistent interface to Mesh**

### 4.3 Adapter interface

```ts
export interface BackendAdapter {
  id: string; // e.g. "foundation", "sap", "oracle"

  // Routing
  canHandle(meshPath: string): boolean;

  // Perform GET resource call
  fetchResource(meshPath: string, headers: Record<string, string>): Promise<{ status: number; resource: CanonicalResource }>;

  // Perform POST action call
  executeAction(
    meshPath: string,
    body: any,
    headers: Record<string, string>
  ): Promise<CanonicalActionResult>;

  health(): Promise<boolean>;
}
```

```ts
export interface CanonicalResource {
  id: string;
  domain: string; // "P2P", "R2R", etc.
  type: string;   // "purchase-order", "journal", etc.
  attributes: Record<string, any>;
  links: Record<string, CanonicalLink>;
}

export interface CanonicalLink {
  href: string;   // Mesh URL, not backend URL
  method: string; // "GET" | "POST"
  rel?: string;
}
```

### 4.4 Adapter registry

Mesh maintains a registry:

```ts
const adapters: BackendAdapter[] = [
  foundationErpAdapter,
  // sapErpAdapter,
  // oracleErpAdapter,
];
```

Routing strategy v1:

- For now, **Foundation ERP adapter** is the only one registered.
- Later, routing can be:
  - by URL prefix (e.g. `/mesh/foundation/*`, `/mesh/sap/*`), or  
  - by tenant/config (e.g. per‑company ERP binding).

---

## 5. Mesh API surface (canonical)

Mesh exposes **canonical** routes, not backend‑specific ones.

### 5.1 Resource hypermedia

```text
GET /mesh/p2p/purchase-orders/:id
GET /mesh/p2p/requisitions/:id
GET /mesh/r2r/journals/:id
GET /mesh/h2r/employees/:id
...
```

- Mesh:
  - identifies domain/type from path  
  - selects appropriate adapter  
  - calls `fetchResource`  
  - receives `CanonicalResource`  
  - filters `links` via Authority + Governance  
  - returns filtered canonical hypermedia  

### 5.2 Action execution

```text
POST /mesh/p2p/purchase-orders/:id/issue
POST /mesh/p2p/requisitions/:id/approve
POST /mesh/r2r/journals/:id/post
POST /mesh/h2r/employees/:id/terminate
...
```

- Mesh:
  - identifies domain/action from path  
  - derives context (per‑domain mapping)  
  - calls Authority Engine  
  - calls Governance Engine  
  - applies decision precedence  
  - if allowed → calls adapter `executeAction`  
  - returns canonical result  

### 5.3 Approval workflow endpoints (Mesh‑owned)

```text
POST /mesh/approvals/:taskId/approve
POST /mesh/approvals/:taskId/reject
GET  /mesh/approvals?actorId=EMP-777
```

- These do **not** go through adapters.
- Mesh uses its own DB for approval tasks.

---

## 6. Hypermedia filtering (canonical)

### 6.1 Input

- `CanonicalResource` from adapter  
- `actorId` (from header, e.g. `x-actor-id`)  
- Authority decision per link  
- Governance decision per link  

### 6.2 Output

- Same `CanonicalResource`, but with `links`:
  - removed if forbidden  
  - annotated if constrained  

### 6.3 Filtering rules

- **If Authority denies → remove link**
- **If Governance denies → remove link**
- **If Governance requires approval → annotate:**

```json
{
  "requiresApproval": true,
  "requiredApproverTier": 3
}
```

- **If Governance escalates → annotate:**

```json
{
  "escalatedToTier": 4
}
```

---

## 7. Execution validation pipeline

1. **Actor identity**
   - Mesh requires explicit header, e.g. `x-actor-id`.
   - No inference from API keys or payloads.

2. **Context derivation**
   - Mesh fetches resource (if needed) via adapter.
   - Applies per‑domain context builder to produce:

```ts
interface GovernanceContext {
  [key: string]: any;
  // e.g. requesterId, amount, journalType, employeeId, credentialType
}
```

3. **Authority check**

```http
POST /authority/check
```

```json
{
  "actorId": "EMP-123",
  "action": "issue",
  "domain": "P2P",
  "context": { "amount": 15000 }
}
```

4. **Governance check**

```http
POST /governance/evaluate
```

```json
{
  "actorId": "EMP-123",
  "action": "issue",
  "domain": "P2P",
  "context": { "amount": 15000 },
  "authorityDecision": { ... }
}
```

5. **Decision precedence**

- Any **deny** → `403` + `MeshActionDenied` event  
- **RequiresApproval** → create approval task  
- **Escalate** → create escalated approval task  
- Else → allowed → call adapter `executeAction`

6. **Execute action via adapter**

- Mesh calls backend through the selected adapter.
- Adapter returns `CanonicalActionResult` (v1 can be simple: success/failure + payload).

---

## 8. Approval workflow (v1)

- **States:** `PENDING → APPROVED → EXECUTED` or `PENDING → REJECTED`
- **Created when:** Governance returns `requiresApproval` or `escalatedToTier`.

### 8.1 Task creation

- Mesh calls:

```http
GET /authority/eligible-approvers?tier=3&domain=P2P
```

- Receives:

```json
{
  "approvers": ["EMP-777", "EMP-888"]
}
```

- Mesh stores:

```json
{
  "taskId": "TASK-999",
  "requiredTier": 3,
  "approvers": ["EMP-777", "EMP-888"],
  "action": "issue",
  "domain": "P2P",
  "context": { "poId": "PO-123" },
  "fingerprint": "hash(actorId + action + domain + resourceId + body)"
}
```

- Emits `MeshApprovalTaskCreated`.

### 8.2 Task completion

- Approver calls:

```http
POST /mesh/approvals/TASK-999/approve
```

- Mesh:
  - verifies approver is eligible (via Authority Engine if needed)  
  - re‑evaluates governance  
  - if allowed → calls adapter `executeAction`  
  - sets state to `EXECUTED`  
  - emits `MeshApprovalCompleted`  

---

## 9. Constitutional events emitted by Mesh

- **MeshHypermediaFiltered**
- **MeshActionDenied**
- **MeshApprovalTaskCreated**
- **MeshApprovalCompleted**

(Structures as in your existing spec; unchanged by ERP‑agnosticism.)

---

## 10. Internal storage (Mesh‑owned only)

- **Tables:**
  - `mesh_approval_task`
  - `mesh_approval_assignment`
  - `mesh_decision_log`

- **v1 storage:**
  - SQLite or Postgres

- **No projections, no event replay.**

---

## 11. Startup sequencing

Mesh must not report ready until:

- Authority Engine is ready (replay complete)  
- Governance Engine is ready (replay complete)  
- At least one backend adapter’s health check passes (e.g. Foundation ERP reachable)  

**Readiness endpoint:**

```http
GET /mesh/ready
```

- Returns `503` until all dependencies are ready.

---

## 12. ERP‑agnosticism summary

- Mesh core:
  - knows **canonical domains**, **canonical actions**, **canonical hypermedia**  
  - knows nothing about specific ERP schemas or URLs  

- Adapters:
  - encapsulate all backend‑specific details  
  - map backend → canonical and canonical → backend  

- Foundation ERP:
  - is simply the **first adapter implementation**, not a special case.


