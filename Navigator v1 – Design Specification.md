### Navigator v1 – Design Specification

---

## 1. Purpose and role

Navigator is the **AI execution layer** of the Constitutional ERP.

- Reads **canonical hypermedia** from the Process Graph Engine (PGE)  
- Uses **LLM‑based reasoning** to rank and select actions  
- Explains decisions in **natural language**  
- Simulates outcomes before execution  
- Respects **constitutional governance and authority**  
- Orchestrates execution via **Mesh Gateway**  
- Learns from **replay** of canonical events  

Navigator is the first subsystem that fully embodies: *AI‑driven execution, human‑anchored governance, and event‑sourced integrity*.

---

## 2. High‑level architecture

Core components:

- **Canonical Hypermedia Interpreter**  
- **LLM‑based Action Ranking Engine**  
- **LLM‑based Explanation Engine**  
- **Predictive Outcome Simulator**  
- **Governance‑Aware Decision Engine**  
- **Mesh Gateway Execution Orchestrator**  
- **Replay‑Driven Learning Loop**  

Navigator interacts with:

- **PGE** for canonical state + hypermedia  
- **Charter Engine** for authority + governance decisions  
- **Mesh Gateway** for ERP execution  
- **CEP/Ledger** for events and replay  

---

## 3. Canonical Hypermedia Interpreter

### 3.1 Input

- Canonical resource from PGE:

```json
{
  "id": "PO-123",
  "domain": "P2P",
  "type": "purchase-order",
  "state": "Issued",
  "attributes": { ... },
  "links": {
    "acknowledge": { "href": "...", "method": "POST", "requiresApproval": false },
    "cancel": { "href": "...", "method": "POST", "requiresApproval": true, "requiredTier": 3 }
  }
}
```

### 3.2 Responsibilities

- Parse `links` into an internal **ActionOption** model:

```ts
interface ActionOption {
  id: string;              // "acknowledge"
  href: string;
  method: "POST" | "GET";
  domain: string;
  aggregateType: string;
  aggregateId: string;
  currentState: string;
  requiresApproval: boolean;
  requiredTier?: number;
  riskSignals: Record<string, any>;
}
```

- Enrich with context:

  - domain semantics (P2P/O2C/R2R/H2R)  
  - monetary amounts, counterparties, periods, etc.  
  - actor identity and authority tier  

This becomes the **input feature set** for the LLM‑based engines.

---

## 4. LLM‑based Action Ranking Engine

### 4.1 Purpose

Given:

- current canonical state  
- list of `ActionOption`s  
- actor context  
- governance annotations  

…produce a **ranked list of recommended actions**.

### 4.2 Interface

```ts
interface RankedAction {
  actionId: string;
  score: number;          // 0–1
  rationale: string;      // short model-generated justification
}

function rankActions(context: NavigatorContext): Promise<RankedAction[]>;
```

`NavigatorContext` includes:

- canonical resource  
- action options  
- actor profile  
- risk profile  
- recent history (from Ledger)  

### 4.3 Behavior

- Uses an LLM prompt that encodes:

  - domain (P2P/O2C/R2R/H2R)  
  - current state  
  - available transitions  
  - risk/amount thresholds  
  - actor authority  

- Returns:

  - ranked actions  
  - short rationales  

Navigator uses this to:

- propose actions to users (Canvas)  
- choose actions in autonomous mode (if allowed)  

---

## 5. LLM‑based Explanation Engine

### 5.1 Purpose

Turn decisions into **human‑readable explanations**:

- why an action is recommended  
- why an action is risky  
- why an action requires approval  
- why an action was denied  

### 5.2 Interface

```ts
function explainDecision(input: {
  context: NavigatorContext;
  chosenAction: RankedAction;
  governanceOutcome: GovernanceOutcome;
}): Promise<string>;
```

### 5.3 Behavior

- Uses LLM with a **constitutional prompt**:

  - emphasize rules, constraints, and risk  
  - avoid hallucinating new rules  
  - ground explanation in canonical state + governance outcome  

- Outputs:

  - short explanation for UI  
  - optional extended explanation for audit  

---

## 6. Predictive Outcome Simulator

### 6.1 Purpose

Answer: **“What happens if we do X?”**

- Simulate downstream state changes  
- Simulate risk impact  
- Simulate required approvals  
- Simulate financial impact (where possible)  

### 6.2 Modes

1. **Heuristic simulation** (v1 core)  
   - Use PGE transitions + domain rules to predict next state.  
   - Example: `issue` → `Issued`, then likely `acknowledge` → `Acknowledged`.

2. **LLM‑assisted simulation**  
   - LLM reasons about likely business consequences.  
   - Example: “Issuing this PO will commit 1.2M USD in spend this quarter.”

### 6.3 Interface

```ts
interface SimulationResult {
  predictedState: string;
  predictedTransitions: string[];
  riskSummary: string;
  financialImpact?: number;
  narrative: string;
}

function simulateAction(input: NavigatorContext, action: ActionOption): Promise<SimulationResult>;
```

---

## 7. Governance‑Aware Decision Engine

### 7.1 Purpose

Combine:

- LLM ranking  
- governance decisions  
- authority decisions  
- simulation results  

…into a **final decision**:

- execute directly  
- request approval  
- escalate  
- reject  

### 7.2 Flow

1. Get canonical hypermedia from PGE.  
2. Interpret into `ActionOption`s.  
3. Call LLM ranking engine.  
4. For top N actions, call:

   - Charter Engine (authority + governance)  
   - Simulator (optional)  

5. Decide:

   - if allowed and low risk → propose/execute  
   - if requires approval → propose with explanation  
   - if denied → explain denial  

### 7.3 Interface

```ts
interface DecisionOutcome {
  action: RankedAction | null;
  mode: "EXECUTE" | "REQUEST_APPROVAL" | "REJECT" | "NO_ACTION";
  explanation: string;
}

function decide(context: NavigatorContext): Promise<DecisionOutcome>;
```

---

## 8. Mesh Gateway Execution Orchestrator

### 8.1 Purpose

Turn a chosen canonical action into **real ERP execution** via Mesh Gateway.

### 8.2 Flow

1. Take `DecisionOutcome` with `mode === "EXECUTE"` or `"REQUEST_APPROVAL"`.  
2. Map canonical action → Mesh endpoint:

   - e.g. P2P PO `issue` → `POST /mesh/p2p/purchase-orders/{id}/issue`  

3. Call Mesh with:

   - `x-api-key`  
   - `x-actor-id`  
   - body (if needed)  

4. Handle responses:

   - `200/201` → success, emit `Navigator.ActionExecuted` event  
   - `202` (approval required) → emit `Navigator.ApprovalRequested` event  
   - `403` → emit `Navigator.ActionDenied` event  
   - other errors → emit `Navigator.ActionFailed` event  

---

## 9. Replay‑Driven Learning Loop

### 9.1 Purpose

Use **Ledger events** to:

- reconstruct past Navigator decisions  
- compare predicted vs actual outcomes  
- refine prompts and heuristics  

### 9.2 Flow

1. CEP writes Navigator events to Ledger:

   - `Navigator.ActionRecommended`  
   - `Navigator.ActionExecuted`  
   - `Navigator.ActionDenied`  
   - `Navigator.ApprovalRequested`  
   - `Navigator.SimulationRun`  

2. Offline process:

   - replay sequences  
   - compute metrics (e.g. “how often did recommended action succeed?”)  
   - adjust:

     - ranking prompts  
     - risk thresholds  
     - simulation heuristics  

Navigator remains **prompt‑tuned**, not self‑modifying code.

---

## 10. Navigator → PGE → Mesh execution flow

1. **Navigator** calls:

   ```http
   GET /graph/{domain}/{aggregateType}/{id}
   ```

2. **PGE** returns canonical resource + links.  
3. Navigator interprets hypermedia → `ActionOption`s.  
4. Navigator ranks actions (LLM).  
5. Navigator calls Charter Engine for top actions.  
6. Navigator decides (execute / approval / reject).  
7. Navigator calls Mesh:

   ```http
   POST /mesh/{domain}/{resource}/{id}/{action}
   ```

8. Mesh executes via adapter → ERP.  
9. ERP emits events → CEP → Ledger.  
10. Navigator emits its own events → CEP → Ledger.  
11. PGE uses Ledger to update canonical state.  

---

## 11. Navigator canonical event types (v1)

Examples:

- `Navigator.ActionRecommended`  
  - `{ domain, aggregateType, aggregateId, actionId, score, rationale }`  

- `Navigator.ActionExecuted`  
  - `{ actionId, meshRequestId, resultState }`  

- `Navigator.ActionDenied`  
  - `{ actionId, reason, governanceDetails }`  

- `Navigator.ApprovalRequested`  
  - `{ actionId, taskId, requiredTier }`  

- `Navigator.SimulationRun`  
  - `{ actionId, predictedState, predictedRisk }`  

All follow the **canonical event schema** (eventType, eventVersion, domain, aggregate, actor, payload).

---

## 12. Navigator reasoning architecture

Layers:

- **Data layer:** PGE, Ledger, Mesh, Charter Engine  
- **Interpretation layer:** Hypermedia Interpreter  
- **Reasoning layer:** LLM Ranking + Explanation + Simulation  
- **Decision layer:** Governance‑Aware Decision Engine  
- **Execution layer:** Mesh Orchestrator  
- **Learning layer:** Replay‑Driven Loop  

LLM is used only in:

- ranking  
- explanation  
- simulation narrative  

All **hard constraints** (authority, governance, state validity) are enforced by:

- PGE  
- Charter Engine  
- Mesh Gateway  

Navigator cannot override the constitution.

---

## 13. Navigator LLM integration plan

### 13.1 Prompts

- **Ranking prompt:**  
  - domain context  
  - current state  
  - available actions  
  - risk/amount  
  - actor authority  

- **Explanation prompt:**  
  - chosen action  
  - governance outcome  
  - state + risk  

- **Simulation prompt:**  
  - hypothetical action  
  - state + risk + domain  

### 13.2 Safety

- LLM output is **advisory**, not authoritative.  
- All actions still go through:

  - PGE state validation  
  - Charter Engine  
  - Mesh Gateway  

Navigator cannot execute anything the constitution forbids.

---

## 14. Navigator test strategy

### 14.1 Unit tests

- Hypermedia Interpreter: links → ActionOption  
- Decision Engine: given mocked ranking + governance → correct mode  
- Mesh Orchestrator: correct Mesh calls per action  

### 14.2 LLM‑assisted tests

- Use **fixed prompts + mocked LLM responses** for determinism.  
- Snapshot tests for explanations and rankings.

### 14.3 Integration tests

- Navigator ↔ PGE ↔ Mesh ↔ Charter Engine (with test doubles where needed).  
- Verify:

  - recommended actions  
  - execution paths  
  - emitted events  

### 14.4 Replay tests

- Feed historical Navigator events from Ledger.  
- Rebuild decision sequences.  
- Assert consistency.

---

## 15. Navigator simulation engine design (v1)

### 15.1 Core

- Use PGE transitions to compute **next canonical state**.  
- Use domain rules to estimate:

  - financial impact  
  - risk impact  
  - approval likelihood  

### 15.2 LLM augmentation

- LLM generates narrative:

  - “Issuing this PO will commit 1.2M USD with a high‑risk supplier; Tier‑3 approval likely required.”

### 15.3 Output

- `SimulationResult` (see section 6.3).  
- Used by:

  - Canvas (what‑if UI)  
  - Decision Engine (risk‑aware ranking)  

### 16 LLM details
- Start with a **small, focused model** (e.g. gpt-5-mini).
