### Phase D – Navigator v2 specification

---

## 1. Purpose and scope

**Goal:** Evolve Navigator from “process-aware executor” to **governance-aware constitutional AI** that:

- Proposes actions based on **process graphs + hypermedia**.
- Respects **governance metadata** (risk, required tier, governance tags).
- Logs **proposals, simulations, decisions, executions** via navlog.
- Works in both **offline (deterministic)** and **online (LLM)** modes.
- Uses **Integration Hub v2** as its sole constitutional boundary.

Scope of Phase D:

- Navigator core refactor to v2.
- Governance-aware planning, simulation, and decisioning.
- Full navlog + transcript integration.
- Integration Hub v2 contract finalisation.
- Test plan for deterministic and AI-assisted behaviour.

---

## 2. Navigator v2 architecture

### 2.1 Components

- **Navigator Core**
  - Orchestrates propose → simulate → decide → execute.
  - Manages sessions and interaction with Integration Hub.
- **Hypermedia Client**
  - Calls Integration Hub v2.
  - Fetches canonical state + links + governance metadata.
- **Governance Evaluator**
  - Interprets riskLevel, requiredTier, governanceTag.
  - Filters and annotates candidate actions.
- **Planner**
  - Builds candidate action sets from hypermedia + PGE hints.
  - Orders them by utility, risk, and governance constraints.
- **Simulator**
  - Offline: uses heuristics + process graph + canonical rules.
  - Online: may call LLM for richer scenario analysis.
- **Decision Engine**
  - Chooses action(s) to recommend or execute.
  - Explains decisions using navlog + governance context.
- **Navlog Client**
  - Writes proposals, simulations, decisions, executions to Integration Hub navlog API.
  - Writes transcript entries.
- **Mode Controller**
  - `AI_OFFLINE=true` → no LLM calls, deterministic only.
  - `AI_OFFLINE=false` → LLM allowed for ranking/explanations.

### 2.2 Architecture diagram (text)

```text
+---------------------------+
|       Navigator v2        |
+---------------------------+
|  Mode Controller          |
|  Session Manager          |
|  Planner                  |
|  Simulator                |
|  Decision Engine          |
|  Governance Evaluator     |
|  Hypermedia Client        |
|  Navlog Client            |
+-------------+-------------+
              |
              | HTTP (governed hypermedia, MCP, navlog)
              v
+---------------------------+
|    Integration Hub v2     |
|  - /process               |
|  - /mcp/functions         |
|  - /hub/sessions          |
|  - /hub/navlog            |
|  - /hub/transcript        |
+-------------+-------------+
              |
              v
+---------------------------+
| Mesh → Foundation ERP →   |
| Event Store / CEP         |
+---------------------------+
```

Navigator never talks directly to Mesh or ERP—only to Integration Hub.

---

## 3. Navigator v2 → Integration Hub v2 contract

### 3.1 Process/hypermedia contract

**Request:**

- `GET /api/v1/hub/process/:entityType/:entityId`
  - Headers: `x-api-key`, `x-actor-id` (or equivalent actor context).

**Response (shape):**

```json
{
  "entityType": "purchase-order",
  "entityId": "PO-123",
  "state": "Approved",
  "attributes": { /* canonical state */ },
  "links": [
    {
      "rel": "receive",
      "href": "/api/v1/p2p/purchase-orders/PO-123/receive",
      "method": "POST",
      "mcpFunctionId": "p2p.receivePurchaseOrder",
      "governance": {
        "riskLevel": "Medium",
        "requiredTier": 2,
        "governanceTag": "p2p.receive"
      }
    },
    {
      "rel": "cancel",
      "href": "/api/v1/p2p/purchase-orders/PO-123/cancel",
      "method": "POST",
      "mcpFunctionId": "p2p.cancelPurchaseOrder",
      "governance": {
        "riskLevel": "High",
        "requiredTier": 3,
        "governanceTag": "p2p.cancel"
      }
    }
  ]
}
```

Navigator responsibilities:

- Use `links[]` as the **only** source of allowed actions.
- Use `governance` to:
  - Filter actions beyond actor’s tier.
  - Annotate proposals with risk and required tier.
  - Explain why some actions are not available.

---

### 3.2 MCP catalog contract

**Request:**

- `GET /api/v1/hub/mcp/functions`

**Response (shape):**

```json
[
  {
    "id": "p2p.receivePurchaseOrder",
    "entity": "purchase-order",
    "action": "receive",
    "riskLevel": "Medium",
    "governanceTag": "p2p.receive",
    "requiredTier": 2,
    "inputSchema": { /* JSON Schema */ },
    "outputSchema": { /* JSON Schema */ }
  }
]
```

Navigator responsibilities:

- Use MCP metadata to:
  - Validate inputs.
  - Enrich explanations.
  - Cross-check governance metadata from hypermedia.

---

### 3.3 Navlog + transcript contract

**Session lifecycle:**

- `POST /api/v1/hub/sessions`
  - Body: `{ actorId, mode: "offline" | "online", context?: {...} }`
  - Response: `{ sessionId }`

- `POST /api/v1/hub/sessions/:sessionId/end`
  - Marks session as closed.

**Navlog entries:**

- `POST /api/v1/hub/sessions/:sessionId/navlog`
  - Body (examples):

```json
{
  "type": "proposal",
  "timestamp": "2026-03-30T10:00:00Z",
  "entityType": "purchase-order",
  "entityId": "PO-123",
  "candidates": [
    {
      "rel": "receive",
      "riskLevel": "Medium",
      "requiredTier": 2,
      "score": 0.82,
      "reason": "Next logical step; within actor tier."
    },
    {
      "rel": "cancel",
      "riskLevel": "High",
      "requiredTier": 3,
      "score": 0.15,
      "reason": "High risk; actor tier insufficient."
    }
  ]
}
```

```json
{
  "type": "simulation",
  "timestamp": "2026-03-30T10:00:02Z",
  "entityType": "purchase-order",
  "entityId": "PO-123",
  "action": "receive",
  "mode": "offline",
  "outcome": {
    "predictedState": "PartiallyReceived",
    "predictedEvents": ["po.received.partial"],
    "riskLevel": "Medium"
  }
}
```

```json
{
  "type": "decision",
  "timestamp": "2026-03-30T10:00:03Z",
  "entityType": "purchase-order",
  "entityId": "PO-123",
  "chosenAction": "receive",
  "reason": "Within actor tier, medium risk, aligns with process graph.",
  "governance": {
    "requiredTier": 2,
    "actorTier": 2,
    "riskLevel": "Medium"
  }
}
```

```json
{
  "type": "execution",
  "timestamp": "2026-03-30T10:00:04Z",
  "entityType": "purchase-order",
  "entityId": "PO-123",
  "action": "receive",
  "result": "success",
  "httpStatus": 200
}
```

**Transcript entries:**

- `POST /api/v1/hub/sessions/:sessionId/transcript`
  - Body: `{ input: string, output: string, timestamp }`

Navigator responsibilities:

- Write navlog entries at each stage.
- Write transcript entries for REPL/Canvas interactions.

---

## 4. Navigator v2 behaviour

### 4.1 Propose

1. Fetch process/hypermedia from Integration Hub.
2. For each `link`:
   - Evaluate governance:
     - If `actorTier < requiredTier` → mark as “not executable by this actor”.
   - Score candidate using:
     - Process hints (from PGE, if available).
     - Risk level.
     - Business heuristics.
     - (Optional) LLM ranking in online mode.
3. Write `proposal` navlog entry.
4. Return ordered candidate list to caller (REPL/Canvas).

### 4.2 Simulate

1. For chosen candidate(s):
   - Offline mode:
     - Use process graph + canonical rules to predict:
       - next state
       - events
       - risk impact
   - Online mode:
     - Optionally call LLM to enrich narrative.
2. Write `simulation` navlog entry.
3. Return simulation result.

### 4.3 Decide

1. Combine:
   - Proposal scores.
   - Simulation outcomes.
   - Governance constraints.
2. Choose action or set of actions.
3. Write `decision` navlog entry.
4. Return decision to caller.

### 4.4 Execute

1. Call Integration Hub to execute the chosen action:
   - Either via hypermedia `href` or MCP function.
2. Capture result.
3. Write `execution` navlog entry.
4. Optionally re-fetch process state for confirmation.

---

## 5. Navigator v2 test plan

### 5.1 Unit tests

**Targets:**

- Planner
  - Given a set of links + governance metadata, produces correctly ordered candidates.
- Governance Evaluator
  - Correctly filters/annotates actions based on actor tier and risk.
- Simulator (offline)
  - Given current state + action, predicts correct next state and events.
- Decision Engine
  - Chooses the correct action given proposals + simulations + governance.

**Examples:**

- Low-tier actor cannot be offered `cancel` on a high-risk PO.
- Medium-tier actor sees both `receive` and `cancel`, but `receive` is ranked higher.
- Offline simulation of `receive` from `Approved` → `PartiallyReceived`.

---

### 5.2 Integration tests (Navigator ↔ Integration Hub)

**Scenarios:**

1. **Governance-aware proposal**
   - Setup: PO in `Approved`, links: `receive` (Tier 2), `cancel` (Tier 3).
   - Actor: Tier 2.
   - Expect:
     - Proposal includes both, but marks `cancel` as not executable.
     - `receive` ranked higher.
     - Navlog `proposal` entry written.

2. **Simulation offline**
   - Same PO.
   - Simulate `receive`.
   - Expect:
     - Predicted state: `PartiallyReceived`.
     - Predicted events: `po.received.partial`.
     - Navlog `simulation` entry written.

3. **Decision + execution**
   - Same scenario.
   - Decide and execute.
   - Expect:
     - `receive` chosen.
     - Execution call to Integration Hub succeeds.
     - Navlog `decision` + `execution` entries written.

4. **Actor tier insufficient**
   - Actor: Tier 1.
   - Links: only high-risk actions.
   - Expect:
     - Navigator returns “no executable actions for this actor”.
     - Navlog explains governance constraint.

---

### 5.3 Offline vs online mode tests

- **Offline mode:**
  - Ensure no LLM calls are made.
  - All decisions are deterministic.
  - Same input → same proposals, simulations, decisions.

- **Online mode:**
  - Allow LLM for ranking/explanations.
  - Validate:
    - No violation of governance constraints.
    - No proposals outside hypermedia links.

---

### 5.4 Regression tests (Phase C alignment)

- Validate that:
  - All governance metadata from Integration Hub is consumed correctly.
  - Navlog entries conform to Phase C schema.
  - No breaking changes to Integration Hub APIs.

