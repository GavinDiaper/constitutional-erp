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

## 16 LLM details

- Start with a **small, focused model** (e.g. gpt-5-mini).
- Use **Azure OpenAI** for enterprise readiness.
- Prompt engineering is critical; invest in crafting clear, context-rich prompts.
- On startup - if LLM connectivity fails then stop Navigator with a clear error; do not allow degraded mode.
- Monitor LLM usage and costs; implement caching where possible.

### Azure OpenAI settings for gpt-5-mini (adjust as needed for other models)

```env

AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2025-01-01-preview
# Optional. Leave empty for model defaults (recommended for GPT-5 deployments).
AZURE_OPENAI_TEMPERATURE=
AZURE_OPENAI_MAX_TOKENS=

```

Example API call:

```js
async callAzureOpenAI(messages) {
        try {
            const payload = {
                messages: messages,
                max_completion_tokens: 16384
                // temperature removed - model only supports default value of 1
            };

            console.log('Sending request to Azure OpenAI...');
            console.log('Endpoint:', `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_MODEL}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`);

            const response = await axios.post(
                `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_MODEL}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': process.env.AZURE_OPENAI_API_KEY
                    }
                }
            );
            console.log('Received response from Azure OpenAI:', response.data);
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error calling Azure OpenAI:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

```
---

Here’s the clean, architectural truth:  
**Navigator should remain *logically stateless*, but it absolutely benefits from having its own *local, embedded datastore* for logging, caching, and learning-loop introspection.**

And yes — **SQLite is the right choice** for Navigator v1.

Let me walk you through the reasoning so the decision is grounded in first principles, not convenience.

---

# ⭐ 1. Navigator *must* be stateless from a constitutional perspective  
Navigator is part of the **constitutional control plane**, and that means:

- It must not hold authoritative state  
- It must not store business data  
- It must not store ERP data  
- It must not store canonical state  
- It must not store governance rules  
- It must not store authority credentials  

All authoritative state lives in:

- **Ledger (CEP)**  
- **PGE**  
- **Charter Engine**  
- **Mesh Gateway**  
- **ERP adapters**  

Navigator must be able to be:

- horizontally scaled  
- restarted  
- replaced  
- upgraded  

…without losing anything important.

So yes — **Navigator is stateless in the constitutional sense**.

---

# ⭐ 2. But Navigator *does* need local persistence for its own brain  
Navigator is an **AI reasoning engine**, and AI systems have different needs than deterministic services.

Navigator needs to store:

### ✔ LLM prompts  
For debugging, reproducibility, and replay.

### ✔ LLM responses  
For audit, regression testing, and learning loops.

### ✔ Ranking decisions  
To compare predicted vs actual outcomes.

### ✔ Simulation results  
To refine heuristics and prompts.

### ✔ Execution traces  
To understand how Navigator interacts with Mesh and PGE.

### ✔ REPL transcripts  
For developer debugging and scenario testing.

### ✔ Caches  
To avoid repeated LLM calls for identical contexts.

### ✔ Replay metadata  
To support Navigator’s replay-driven learning loop.

None of this belongs in the Ledger.  
None of this belongs in PGE.  
None of this belongs in Mesh.

This is **Navigator’s internal memory**, not constitutional memory.

---

# ⭐ 3. Why SQLite is the perfect fit  
SQLite gives you:

### ✔ Embedded  
No external service dependency.

### ✔ Fast  
Perfect for caching and logging.

### ✔ Durable  
Navigator logs survive restarts.

### ✔ Portable  
Works on dev machines, CI, containers.

### ✔ Zero operational overhead  
No cluster, no replication, no ops burden.

### ✔ Ideal for REPL  
The REPL can query the same SQLite database for:

- transcripts  
- decisions  
- LLM exchanges  
- simulations  
- ranking history  

### ✔ Ideal for learning loops  
Navigator can run offline analysis on its own logs.

### ✔ Ideal for prompt regression testing  
You can snapshot:

- prompts  
- responses  
- decisions  

…and compare across versions.

---

# ⭐ 4. What Navigator should *not* store in SQLite  
Navigator must **never** store:

- canonical events  
- canonical state  
- governance rules  
- authority credentials  
- ERP data  
- user data  
- business data  

Those belong in the constitutional subsystems.

Navigator’s SQLite is strictly for:

- **AI reasoning artifacts**  
- **debugging**  
- **caching**  
- **learning loops**  
- **REPL transcripts**  

---

# ⭐ 5. Recommended SQLite schema (v1)

### **1. llm_exchanges**
Stores prompts + responses.

```
id (pk)
timestamp
context_hash
prompt
response
model
duration_ms
```

### **2. navigator_decisions**
Stores ranked actions + chosen action.

```
id (pk)
timestamp
aggregate_id
domain
state
actions_json
chosen_action
explanation
governance_outcome_json
```

### **3. simulations**
Stores simulation results.

```
id (pk)
timestamp
aggregate_id
action
predicted_state
risk_summary
narrative
```

### **4. repl_sessions**
Stores REPL transcripts.

```
id (pk)
timestamp
command
output
context_json
```

### **5. cache**
Generic key/value cache for repeated LLM calls.

```
key (pk)
value
expires_at
```

---

# ⭐ 6. Navigator remains stateless *from the outside*  
Even with SQLite, Navigator is:

- horizontally scalable  
- restartable  
- ephemeral  

Because:

- SQLite is local  
- no authoritative state is stored  
- no cross-node coordination is needed  
- no constitutional data is stored  

Navigator nodes do not need to share SQLite files.  
Each node can have its own local “brain scratchpad”.

---

# ⭐ 7. This is exactly how modern AI agents are built  
Every serious AI agent architecture uses:

- **stateless core logic**  
- **local persistent memory for reasoning artifacts**  

Examples:

- LangChain agents  
- ReAct agents  
- AutoGPT  
- Devin  
- Claude Tools  
- OpenAI Swarm  

Navigator is in the same category.

---

## LLM should be generic

Navigator’s LLM integration should be designed to be **model-agnostic**:
- Define a clear interface for LLM calls (e.g. `callLLM(prompt): response`).
- Implement an adapter for Azure OpenAI (gpt-5-mini).
- Allow for future adapters (e.g. Anthropic, local models) without changing core logic.

# Navigator Learning Loop
Here’s the clean, principled answer — and it’s one that will keep your architecture elegant rather than prematurely heavy.

---

# ⭐ **Short Answer**  
**The learning loop is *not* required for Navigator v1.  
It is *not* critical to the core design.  
It should be treated as an add‑on that comes in Navigator v1.5 or v2.**

Navigator v1 needs to *emit* the data that the learning loop will eventually consume — but it does **not** need to *process* that data yet.

This is the same pattern used by:

- self‑driving systems  
- recommendation engines  
- AI copilots  
- reinforcement learning agents  

They all **log first**, **learn later**.

---

# ⭐ **Why the learning loop is not required in v1**

Navigator v1 must deliver:

- **AI‑driven execution**  
- **LLM reasoning**  
- **explanations**  
- **simulation**  
- **governance‑aware decisions**  
- **Mesh execution**  
- **canonical event emission**

That is already a *lot* of surface area.

The learning loop is:

- offline  
- non‑critical  
- non‑blocking  
- non‑constitutional  
- not required for correctness  
- not required for safety  
- not required for execution  

Navigator v1 can operate perfectly without it.

---

# ⭐ **But Navigator v1 *must* emit the right events for the future learning loop**

This is the key architectural point.

Navigator v1 should:

### ✔ Emit events like:
- `Navigator.ActionRecommended`  
- `Navigator.ActionExecuted`  
- `Navigator.ActionDenied`  
- `Navigator.SimulationRun`  
- `Navigator.ExplanationGenerated`  

### ✔ Store LLM prompts/responses in SQLite  
This is cheap and gives you future leverage.

### ✔ Store ranking decisions  
So you can compare predicted vs actual outcomes later.

### ✔ Store simulation results  
So you can refine heuristics later.

### ✔ Store REPL transcripts  
So you can replay reasoning sessions.

### ✔ Store governance outcomes  
So you can train the model to anticipate governance decisions.

But Navigator v1 does **not** need to:

- analyze these logs  
- compute metrics  
- adjust prompts  
- refine heuristics  
- run offline training  
- run reinforcement learning  
- run prompt optimization  

Those are v1.5 or v2 features.

---

# ⭐ **Why delaying the learning loop is the right architectural move**

### 1. **Navigator v1 must be deterministic and explainable**  
Adding learning too early risks:

- non‑determinism  
- prompt drift  
- unpredictable behavior  

You want Navigator v1 to be **stable**, **predictable**, and **auditable**.

### 2. **You need real production data before learning is meaningful**  
Learning loops are only valuable when:

- real users  
- real decisions  
- real governance outcomes  
- real ERP flows  

…exist.

Navigator v1 will not have that yet.

### 3. **The learning loop is an optimization, not a requirement**  
Navigator v1 must be correct.  
Navigator v2 must be smart.

### 4. **You avoid premature complexity**  
Learning loops require:

- metrics  
- dashboards  
- offline jobs  
- prompt versioning  
- evaluation harnesses  

These are expensive to build and maintain.

### 5. **You keep the constitutional architecture clean**  
Navigator v1 should be:

- a reasoning engine  
- not a self‑modifying system  

The constitution demands stability.

---

# ⭐ **Recommended roadmap**

## **Navigator v1 (now)**
- LLM ranking  
- LLM explanation  
- simulation  
- governance‑aware decisions  
- Mesh execution  
- canonical event emission  
- SQLite logging  
- REPL interface  

**No learning loop.**

---

## **Navigator v1.5**
- Offline analysis scripts  
- Prompt evaluation harness  
- Replay‑based scoring  
- Manual prompt tuning  

**Still no automatic learning.**

---

## **Navigator v2**
- Automated learning loop  
- Prompt optimization  
- Heuristic refinement  
- Predictive model tuning  
- Risk prediction model  
- Governance outcome prediction  

**This is where the learning loop becomes real.**

---

# ⭐ Conclusion

> **Navigator v1 does not need the learning loop.  
> It is not critical to the core design.  
> Navigator v1 should only emit the data that the learning loop will eventually consume.  
> The learning loop itself should be built in Navigator v1.5 or v2, once real data exists.**

This keeps Navigator v1:

- stable  
- deterministic  
- constitutional  
- testable  
- explainable  

And it sets you up for a powerful v2 without architectural debt.

# Task Orientation
Here’s the clean architectural answer, and it’s one of those decisions that—if you get it right now—will keep Navigator elegant for years.

You’re essentially choosing between two API philosophies:

- **Task‑oriented API** (verbs):  
  `/rank`, `/propose`, `/simulate`, `/decide`, `/execute`

- **Resource‑oriented API** (nouns):  
  `/sessions`, `/recommendations`, `/simulations`, `/decisions`, `/executions`

This is not a superficial choice. It determines how Navigator fits into the constitutional architecture and how future clients (Canvas, REPL, agents, batch jobs) will interact with it.

Let’s walk through the reasoning.

---

# ⭐ The correct answer  
**Navigator should expose *task‑oriented* endpoints that match the REPL verbs.**

This is the cleanest, most future‑proof design.

Let me explain why.

---

# 🧠 1. Navigator is not CRUD — it is an AI agent  
Navigator is fundamentally:

- a reasoning engine  
- a planner  
- a simulator  
- a decision-maker  
- an orchestrator  

These are **actions**, not resources.

Trying to force Navigator into a REST‑resource shape would distort the architecture.

Navigator is closer to:

- a compiler  
- a solver  
- a planner  
- a conversational agent  

These systems expose **verbs**, not nouns.

---

# 🧭 2. Navigator’s operations are *ephemeral tasks*, not persistent objects  
When you call:

- `/rank`  
- `/simulate`  
- `/decide`  
- `/explain`  

…you’re not creating or modifying a resource.  
You’re asking Navigator to **think**.

Thinking is not a resource.  
It’s a task.

Navigator’s outputs are:

- ranked actions  
- explanations  
- simulations  
- decisions  
- execution results  

These are **results**, not resources.

---

# 🧩 3. The REPL verbs *are* the Navigator’s natural API  
Your REPL already defines the canonical verbs:

- `show`  
- `propose`  
- `explain`  
- `simulate`  
- `decide`  
- `execute`  
- `history`  

These map perfectly to task endpoints:

```
POST /navigator/show
POST /navigator/propose
POST /navigator/explain
POST /navigator/simulate
POST /navigator/decide
POST /navigator/execute
POST /navigator/history
```

This gives you:

- one mental model  
- one vocabulary  
- one interaction pattern  
- one debugging surface  
- one API for Canvas, REPL, and automation  

It’s beautifully consistent.

---

# 🧱 4. Resource‑oriented endpoints would create unnecessary complexity  
If you tried to force Navigator into a REST‑resource shape, you’d end up with awkward patterns like:

```
POST /sessions/{id}/recommendations
POST /sessions/{id}/simulations
POST /sessions/{id}/decisions
```

Or worse:

```
GET /recommendations?domain=p2p&aggregateId=PO-123
```

This is:

- unnatural  
- verbose  
- harder to reason about  
- harder to test  
- harder to evolve  
- not aligned with Navigator’s purpose  

Navigator is not a CRUD system.  
Navigator is a **thinking system**.

Thinking systems expose **verbs**.

---

# 🧠 5. Task‑oriented APIs align with the constitutional architecture  
Navigator sits in the **control plane**, not the data plane.

Control plane systems expose:

- actions  
- evaluations  
- decisions  
- simulations  
- validations  

Examples:

- Charter Engine: `/evaluate`  
- Mesh Gateway: `/execute`  
- PGE: `/graph/...` (state machine transitions)  
- CEP: `/ingest`  

Navigator fits this pattern perfectly.

---

# 🧩 6. Task‑oriented APIs are easier for Canvas  
Canvas will call:

- `/propose` to get recommended actions  
- `/simulate` to show “what if”  
- `/explain` to show reasoning  
- `/decide` to get the final decision  
- `/execute` to perform the action  

Canvas becomes a thin UI wrapper over Navigator.

This is exactly what you want.

---

# ⭐ Final Recommendation  
> **Navigator should expose task‑oriented endpoints that match the REPL verbs.  
> Navigator is an AI agent, not a CRUD service.  
> Task endpoints keep the architecture clean, expressive, and aligned with the constitutional control plane.**

This gives you:

- a unified mental model  
- a clean REPL → API → Canvas alignment  
- a natural fit for AI reasoning  
- a future‑proof interface for agents and automation  

---
Navigator events need a real ingestion path, so we need to add CEP push ingestion endpoint for Navigator so it can POST canonical events directly to CEP, which then writes to Ledger and makes them available for PGE and replay.

Absolutely — and you’ve just identified a **necessary architectural evolution** in CEP.  
Navigator is now a first‑class constitutional subsystem, and that means it must have a **real, official, supported ingestion path** into the canonical event stream.

Let’s make this crisp and grounded in the constitutional architecture.

---

# ⭐ Yes — CEP must expose a dedicated push‑ingestion endpoint for Navigator

Navigator emits canonical events that are:

- part of the constitutional audit trail  
- required for replay  
- required for temporal integrity  
- required for simulation and explainability  
- required for cross‑subsystem causality  
- required for future learning loops  

These events **must** enter the same event stream as:

- Mesh Gateway events  
- ERP adapter events  
- Governance events  
- Authority events  
- PGE events  

CEP is the *only* subsystem responsible for:

- canonical event validation  
- deduplication  
- ordering  
- persistence  
- replay  
- correlation  
- causation  
- temporal integrity  

Navigator cannot bypass this.

So yes — **Navigator needs a real ingestion endpoint**, and CEP must provide it.

---

# 🧱 Why Navigator cannot rely on local persistence + pull adapter

You already sensed this, and you’re right.  
A pull‑based model would break:

- ordering  
- causality  
- replay  
- auditability  
- cross‑subsystem correlation  
- temporal guarantees  

Navigator is stateless by design.  
CEP is the constitutional event store.

Navigator must push events **immediately**.

---

# ⭐ What the new CEP ingestion endpoint should look like

Navigator should POST canonical events to CEP using the same schema as all other constitutional subsystems.

### **Endpoint**
```
POST /events
```

### **Payload**
A canonical event:

```json
{
  "eventType": "Navigator.ActionRecommended",
  "eventVersion": 1,
  "domain": { "name": "P2P", "aggregateType": "purchase-order", "aggregateId": "PO-123" },
  "actor": { "id": "USR-001", "role": "navigator" },
  "timestamp": "2026-03-28T09:15:00Z",
  "payload": {
    "rankedActions": [...],
    "chosenAction": "acknowledge",
    "score": 0.87,
    "rationale": "Supplier has already confirmed..."
  },
  "metadata": {
    "correlationId": "...",
    "causationId": "..."
  }
}
```

Navigator should not need a special endpoint — it should use the **same ingestion API** as Mesh Gateway and other producers.

CEP should simply:

- validate  
- normalize  
- dedupe  
- append  
- index  
- emit to Ledger  

Navigator becomes a **first‑class event producer**.

---

# 🧭 What CEP needs to add (minimal changes)

CEP already supports ingestion, but Navigator introduces a new producer type.  
CEP needs to:

### ✔ Accept `navigator` as a valid producer  
### ✔ Validate Navigator’s canonical event types  
### ✔ Ensure Navigator events follow the same schema  
### ✔ Add Navigator to the producer registry (if you have one)  
### ✔ Add Navigator to event source metadata  
### ✔ Add tests for Navigator event ingestion  

This is a **small change** but an important one.

---

# ⭐ Why this is the right architectural move

### 1. **Navigator becomes a constitutional citizen**  
Its decisions become part of the immutable record.

### 2. **Replay works end‑to‑end**  
Navigator → CEP → Ledger → PGE → Navigator.

### 3. **Simulation and explainability become auditable**  
You can reconstruct:

- what Navigator recommended  
- why it recommended it  
- what it simulated  
- what it executed  
- what governance said  
- what Mesh did  
- what ERP emitted  

### 4. **Future learning loops depend on this**  
Navigator v2 will analyze:

- its own past decisions  
- their outcomes  
- governance responses  
- ERP responses  

This requires canonical events.

### 5. **Canvas can show Navigator’s reasoning history**  
Canvas v1 will rely on:

- `Navigator.ActionRecommended`  
- `Navigator.ExplanationGenerated`  
- `Navigator.SimulationRun`  

These must be in the Ledger.

---

# ⭐ Final Answer

> **Navigator must POST its canonical events directly to CEP’s ingestion API.  
> CEP must expose a push‑ingestion endpoint that accepts Navigator events.  
> Navigator should not buffer canonical events locally or rely on a pull adapter.  
> This keeps the constitutional event stream unified, replayable, and auditable.**

This is the cleanest, most future‑proof architectural choice.

---



# Navigator REPL v1 – Design Specification  

## 1. Purpose and role

The **Navigator REPL** is a **terminal-based interaction layer** for Navigator.

- Provides a **human-friendly console** to drive Navigator without a UI  
- Acts as the **primary exploratory and debugging surface** for developers  
- Serves as a **test harness** for reasoning, simulation, and execution flows  
- Remains **UI-agnostic**, so Canvas can later reuse the same Navigator APIs  

It is not a separate brain—just a thin shell over Navigator’s core services.

---

## 2. High-level architecture

**Layers:**

- **CLI/REPL Shell:** reads commands, prints results  
- **Command Router:** parses commands → structured requests  
- **Navigator Client:** calls Navigator core APIs (PGE, Mesh, Charter, Ledger via Navigator)  
- **Formatter Layer:** renders canonical state, actions, explanations, simulations in human-readable form  

```text
User
  ↓
REPL Shell (stdin/stdout)
  ↓
Command Router
  ↓
Navigator Client (SDK)
  ↓
Navigator Core → PGE / Mesh / Charter / Ledger
  ↓
Formatter → REPL Shell → User
```

---

## 3. Core concepts

### 3.1 Session context

The REPL maintains a **current context**:

```ts
interface SessionContext {
  domain?: "P2P" | "O2C" | "R2R" | "H2R";
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
}
```

Commands can set or override this context; most commands operate “in context”.

---

## 4. Command set v1

### 4.1 Context and navigation

- **`set actor <actorId>`**  
  Set current actor.

- **`use <domain> <aggregateType> <id>`**  
  Set current domain/aggregate/id.  
  Example: `use p2p purchase-order PO-123`

- **`show`**  
  Fetch canonical resource from PGE via Navigator and display:  
  - state  
  - key attributes  
  - available actions (links)

---

### 4.2 Proposals and decisions

- **`propose`**  
  Ask Navigator to rank actions for current context.  
  Output: ranked list with scores + short rationales.

- **`explain [actionId]`**  
  Explain why an action is recommended or not.  
  - If `actionId` omitted → explain top recommendation.  

- **`simulate <actionId>`**  
  Run Predictive Outcome Simulator for a given action.  
  Output: predicted state, risk summary, narrative.

- **`decide`**  
  Run full Governance‑Aware Decision Engine:  
  - choose action (or none)  
  - mode: EXECUTE / REQUEST_APPROVAL / REJECT / NO_ACTION  
  - explanation.

---

### 4.3 Execution

- **`execute [actionId]`**  
  Execute an action via Mesh Gateway (through Navigator).  
  - If `actionId` omitted → execute chosen action from last `decide`/`propose`.  
  Output:  
  - Mesh result (status, new state)  
  - Navigator events emitted.

---

### 4.4 History and replay

- **`history`**  
  Show recent canonical events for current aggregate (from Ledger).

- **`navlog`**  
  Show recent Navigator events for current aggregate.

- **`replay`**  
  Rebuild and display state from events (PGE replay) to verify consistency.

---

### 4.5 Meta

- **`help`**  
  List commands and usage.

- **`context`**  
  Show current session context.

- **`quit` / `exit`**  
  End session.

---

## 5. Navigator client API (used by REPL)

The REPL should call a **Navigator SDK**, not internal services directly.

Key methods:

```ts
interface NavigatorClient {
  getResource(ctx: SessionContext): Promise<CanonicalResource>;
  rankActions(ctx: SessionContext): Promise<RankedAction[]>;
  explainDecision(ctx: SessionContext, actionId?: string): Promise<string>;
  simulateAction(ctx: SessionContext, actionId: string): Promise<SimulationResult>;
  decide(ctx: SessionContext): Promise<DecisionOutcome>;
  execute(ctx: SessionContext, actionId?: string): Promise<ExecutionResult>;
  getHistory(ctx: SessionContext): Promise<CanonicalEvent[]>;
  getNavigatorEvents(ctx: SessionContext): Promise<CanonicalEvent[]>;
}
```

The REPL is then a thin wrapper over this client.

---

## 6. Output formatting

### 6.1 `show`

- **Header:** `P2P / purchase-order / PO-123 (state: Issued)`  
- **Attributes:** key fields (amount, supplier, dates)  
- **Actions:** table of `actionId`, `requiresApproval`, `requiredTier`

### 6.2 `propose`

- Ranked list:

```text
1) acknowledge  [score: 0.87]
   rationale: Supplier has already confirmed; next logical step is acknowledgment.

2) cancel       [score: 0.12]
   rationale: High-value PO; cancellation is unusual unless risk or error is detected.
```

### 6.3 `simulate`

- Predicted state, risk, narrative.

### 6.4 `decide` / `execute`

- Mode, chosen action, explanation, Mesh result, new state.

---

## 7. Test strategy for Navigator REPL

### 7.1 Unit tests

- Command parsing → correct NavigatorClient calls.  
- Context handling (set/use/override).  
- Formatting functions (stable, snapshot‑tested).

### 7.2 Integration tests

- Use a **test NavigatorClient** wired to real Navigator in a test environment.  
- Scenario scripts:

  - P2P: `use` → `show` → `propose` → `simulate issue` → `decide` → `execute`  
  - O2C: similar flows.  

- Assert:

  - no crashes  
  - expected commands produce expected Navigator calls  
  - outputs contain key markers (state, actions, explanations).

### 7.3 LLM determinism

- For automated tests, mock LLM responses in Navigator.  
- REPL tests then validate structure, not free‑form text.

---

## 8. Integration with future Canvas

Canvas v1 should:

- **not** talk directly to PGE/Mesh/Charter.  
- Instead, call the same **NavigatorClient** used by the REPL (HTTP or gRPC façade).

This ensures:

- REPL and Canvas share the same brain  
- REPL remains the debugging and deep‑inspection tool  
- Canvas focuses purely on UX.

---

## 9. Non-goals for REPL v1

- No multi-user sessions.  
- No persistence of REPL sessions.  
- No complex scripting language (simple commands only).  
- No direct ERP calls (always via Navigator).

---

In short:

- Navigator REPL is your **developer cockpit** for the AI brain.  
- It validates Navigator **before** Canvas exists.  
- It becomes the **canonical way** to introspect decisions, simulations, and executions.

- It ensures Navigator’s APIs are **well‑designed and consistent** before we build a UI on top.

### Directory structure

/navigator-ai
  /core
    /reasoning
    /simulation
    /decision
    /execution
    /events
    index.ts
  /client
    navigator-client.ts
  /tests
    unit/
    integration/

/navigator-repl
  /commands
  /formatters
  /session
  /tests
  repl.ts

/canvas-ui (future)
/distributed-fabric (future)
