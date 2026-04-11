# Integration Hub Subsystem – Developer Specification (v1)

## 1. Role in the architecture

**Purpose:**  
Integration Hub is the **constitutional gateway** between Navigator and the underlying platform. It:

- Publishes **MCP** (function catalog + schemas) for AI autonomy.
- Publishes **Hypermedia** (state + transitions) for safe, constrained execution.
- Integrates **governance** (Charter, Authority) at the boundary.
- Delegates execution to **Mesh** and process semantics to **PGE**.

**Position:**

```text
UI (Canvas, REPL, Admin)
            ↓
        Navigator
            ↓
     Integration Hub
 (MCP + Hypermedia + Governance)
            ↓
          Mesh
            ↓
          ERP(s)
```

Navigator talks **only** to Integration Hub.

---

## 2. Responsibilities and boundaries

### 2.1 Responsibilities

- **MCP Publisher**
  - Expose function catalog and schemas.
  - Provide metadata for AI reasoning (entity, operationType, risk, governanceTag).

- **Hypermedia Publisher**
  - Expose current state and allowed transitions as links.
  - Execute transitions via hypermedia actions.

- **Governance Boundary**
  - Filter/annotate allowed actions using Charter + Authority.
  - Ensure AI cannot see or execute disallowed transitions.

- **Execution Orchestrator**
  - Resolve MCP functions to Mesh routes.
  - Call Mesh and normalize responses.

### 2.2 Non-responsibilities

- No direct ERP integration (Mesh owns that).
- No process graph ownership (PGE owns that).
- No direct UI or AI logic (Navigator owns that).

---

## 3. External API (public surface)

All endpoints are **HTTP/JSON** and **Navigator-facing**.

### 3.1 `GET /mcp/functions`

**Description:** List all functions the AI can call.

**Response 200:**

```json
{
  "version": "1.0.0",
  "functions": [
    {
      "id": "create_supplier",
      "name": "Create Supplier",
      "description": "Create a new supplier record in the ERP.",
      "entity": "Supplier",
      "operationType": "create",
      "inputSchema": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "status": { "type": "string", "enum": ["Active", "Inactive"] }
        }
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string" }
        }
      },
      "backingRoute": "/internal/mesh/suppliers/create",
      "riskLevel": "Low",
      "governanceTag": "MasterData.Create"
    }
  ]
}
```

---

### 3.2 `GET /mcp/functions/{id}`

**Description:** Get a single function definition.

**Response 200:**

```json
{
  "id": "approve_po",
  "name": "Approve Purchase Order",
  "description": "Approve a purchase order currently in Draft state.",
  "entity": "PurchaseOrder",
  "operationType": "transition",
  "inputSchema": {
    "type": "object",
    "required": ["poId"],
    "properties": {
      "poId": { "type": "string" },
      "comment": { "type": "string" }
    }
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "state": { "type": "string" }
    }
  },
  "backingRoute": "/internal/mesh/purchase-orders/approve",
  "riskLevel": "Medium",
  "governanceTag": "PO.Approve"
}
```

---

### 3.3 `GET /process/{entity}/{id}`

**Description:** Return current state and allowed actions (hypermedia affordances) for an object.

**Response 200:**

```json
{
  "entity": "PurchaseOrder",
  "id": "PO123",
  "state": "Draft",
  "attributes": {
    "supplierId": "SUP001",
    "totalAmount": 1200.50,
    "currency": "USD"
  },
  "links": [
    {
      "rel": "approve",
      "href": "/process/PurchaseOrder/PO123/actions/approve",
      "method": "POST",
      "mcpFunctionId": "approve_po",
      "requiredInput": {
        "type": "object",
        "required": ["comment"],
        "properties": {
          "comment": { "type": "string" }
        }
      },
      "governance": {
        "riskLevel": "Medium",
        "requiredAuthority": "PO.Approver"
      }
    }
  ]
}
```

**Notes:**

- `links[]` is the **only** set of actions Navigator may consider.
- Each link references an MCP function via `mcpFunctionId`.

---

### 3.4 `POST /process/{entity}/{id}/actions/{action}`

**Description:** Execute a transition.

**Request body example:**

```json
{
  "comment": "Approved by automated workflow"
}
```

**Response 200:**

```json
{
  "entity": "PurchaseOrder",
  "id": "PO123",
  "previousState": "Draft",
  "newState": "Approved",
  "timestamp": "2026-03-29T12:45:00Z",
  "eventId": "evt-982374",
  "links": [
    {
      "rel": "send_to_supplier",
      "href": "/process/PurchaseOrder/PO123/actions/send_to_supplier",
      "method": "POST",
      "mcpFunctionId": "send_po",
      "requiredInput": {
        "type": "object",
        "properties": {
          "deliveryMethod": { "type": "string" }
        }
      }
    }
  ]
}
```

**Notes:**

- Response includes **new state** and **next allowed actions**.
- Navigator continues by following the next link.

---

## 4. Internal components and interactions

### 4.1 Core modules

- **McpCatalog**
  - Loads MCP function definitions (static config v1).
  - Provides lookup by `id`, `entity`, `operationType`.

- **ProcessFacade**
  - Talks to PGE to:
    - get current state for `{entity, id}`
    - get valid transitions from that state.

- **GovernanceFacade**
  - Talks to Charter + Authority to:
    - filter transitions
    - annotate governance metadata (risk, requiredAuthority).

- **MeshClient**
  - Calls Mesh internal routes defined in `backingRoute`.
  - Normalizes responses to match `outputSchema`.

- **HypermediaBuilder**
  - Combines:
    - state (from PGE / Mesh)
    - transitions (from PGE)
    - MCP functions (from McpCatalog)
    - governance (from GovernanceFacade)
  - Produces `links[]` for `/process/{entity}/{id}` and action responses.

### 4.2 Internal call flows

#### 4.2.1 `GET /mcp/functions`

1. Controller → McpCatalog → return list.

#### 4.2.2 `GET /process/{entity}/{id}`

1. Controller → ProcessFacade:
   - get current state + attributes.
   - get valid transitions.
2. For each transition:
   - map to `mcpFunctionId` via McpCatalog.
   - call GovernanceFacade to check permission and risk.
3. HypermediaBuilder → build `links[]`.
4. Return state + attributes + links.

#### 4.2.3 `POST /process/{entity}/{id}/actions/{action}`

1. Controller:
   - validate request body against `requiredInput` (from MCP).
2. Resolve `mcpFunctionId` for `{entity, action}`.
3. GovernanceFacade:
   - verify caller is allowed to execute.
4. MeshClient:
   - call `backingRoute` with validated payload.
5. ProcessFacade:
   - get updated state + valid transitions.
6. HypermediaBuilder:
   - build `links[]` for new state.
7. Return previousState, newState, eventId, links.

---

## 5. Data model (MCP function)

Minimal v1 structure:

```ts
type McpFunction = {
  id: string;                // "approve_po"
  name: string;              // "Approve Purchase Order"
  description: string;
  entity: string;            // "PurchaseOrder"
  operationType: "create" | "update" | "transition" | "query";
  inputSchema: JsonSchema;   // JSON Schema object
  outputSchema: JsonSchema;  // JSON Schema object
  backingRoute: string;      // "/internal/mesh/purchase-orders/approve"
  riskLevel?: "Low" | "Medium" | "High";
  governanceTag?: string;    // e.g. "PO.Approve"
};
```

---

## 6. Migration notes (how to adopt this)

### 6.1 Phase 1 – Add Integration Hub (no behaviour change)

- Implement Integration Hub service.
- Implement:
  - `GET /mcp/functions` (static config).
  - `GET /mcp/functions/{id}`.
- Keep Navigator still calling Mesh directly for execution.

### 6.2 Phase 2 – Add Hypermedia and wire to Mesh/PGE

- Implement:
  - `GET /process/{entity}/{id}`
  - `POST /process/{entity}/{id}/actions/{action}`
- Use PGE for state + transitions.
- Use Mesh for execution via `backingRoute`.

### 6.3 Phase 3 – Switch Navigator to Integration Hub

- Update Navigator to:
  - discover functions via `/mcp/functions`.
  - navigate processes via `/process/{entity}/{id}` and action posts.
- Remove direct Navigator → Mesh calls.

### 6.4 Phase 4 – Integrate Charter + Authority

- In HypermediaBuilder:
  - call GovernanceFacade to filter/annotate links.
- Ensure only allowed links are exposed to Navigator.

---

## 7. Developer guidance

- Treat Integration Hub as the **only public API** for AI and UI.
- Keep Mesh, PGE, Charter, Authority **behind** Integration Hub.
- Keep v1 simple:
  - static MCP config
  - minimal entities/flows (e.g. Supplier, Requisition, PO)
- Design everything so MCP + Hypermedia are **the source of truth** for Navigator’s understanding and constraints.

