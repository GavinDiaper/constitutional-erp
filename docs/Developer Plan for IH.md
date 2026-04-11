**Plan**
Build Integration Hub as the sole Navigator-facing constitutional gateway in the Constitutional Layer, replacing the current public role of navigator-ai and moving the REPL to the new MCP plus hypermedia contract directly. The recommended path is to bootstrap the new service from the established sibling-service pattern, migrate reusable navigator-ai orchestration into it, implement the new `/mcp/*` and `/process/*` surfaces, then cut the REPL over once the Hub can own both execution and AI-facing workflows.

**Steps**
1. Phase 1: bootstrap the Integration Hub service in the existing stub at .gitignore using the same Node, TypeScript, Express, env, auth, error-handling, and test harness structure used by sibling services.
2. Phase 2: define the Hub’s internal contracts for MCP functions, process state, hypermedia links, governance metadata, action execution results, and AI request/response DTOs. This is the dependency anchor for everything else.
3. Phase 3: build the core domain modules:
   ProcessFacade for state and transitions,
   GovernanceFacade for filtering and annotation,
   Mesh execution adapter for backing routes,
   HypermediaBuilder for `links[]`,
   and an enriched MCP catalog sourced from Foundation ERP capabilities.
4. Phase 4: implement the new public API:
   `GET /mcp/functions`,
   `GET /mcp/functions/{id}`,
   `GET /process/{entity}/{id}`,
   `POST /process/{entity}/{id}/actions/{action}`.
   These routes must become the constitutional source of truth for Navigator execution.
5. Phase 5: migrate the current navigator-ai public responsibilities into Integration Hub so the Hub also owns ranking, explanation, simulation, decisioning, execution orchestration, event publication, history, navlog, and transcript handling.
6. Phase 6: refactor navigator-repl to target Integration Hub natively, replacing the current navigator-ai client flow with direct MCP discovery plus process navigation and action execution.
7. Phase 7: add verification coverage across core Hub APIs, AI flows, audit persistence, and REPL smoke scenarios, then perform the cutover with navigator-ai removed from the public path.

**Relevant files**
- Integration Hub Subsystem – Developer Specification (v1).md
- .gitignore
- package.json
- env.ts
- app.ts
- navigator.routes.ts
- navigatorService.ts
- navigatorStore.ts
- pgeClient.ts
- meshClient.ts
- env.ts
- navigatorClient.ts
- mcp.routes.ts
- IntegrationHub-API-Guide.md

**Verification**
1. Build and start Integration Hub with the standard service scripts and verify auth plus health behavior.
2. Verify the MCP catalog returns enriched function metadata for all modeled Foundation ERP capabilities.
3. Verify process reads return current state, attributes, and governed hypermedia links only.
4. Verify action execution validates input, routes through Mesh, refreshes state, and returns next links plus event metadata.
5. Verify ranking, explanation, simulation, decision, execution, history, navlog, and transcript flows now work through Integration Hub.
6. Verify REPL smoke flows for at least one lifecycle in each domain and confirm every outbound call targets Integration Hub only.
7. Extend Newman and automated integration coverage so catalog drift and action-mapping regressions are caught.

**Decisions captured**
- Integration Hub replaces navigator-ai as the public Navigator-facing boundary.
- REPL will be refactored directly to MCP and process endpoints, not through a compatibility shim.
- V1 scope includes all currently modeled Foundation ERP domains and functions.
- REPL-dependent assistant and audit features are in scope to move into Integration Hub.
- Mesh remains the execution substrate and governance stays enforced inside the Hub.

-------           ---- ---------- ------------ ------
foundation-erp    3000                   False       
authority-engine  4001                   False       
governance-engine 4002                   False       
mesh-gateway      4003                   False       
event-processor   4004                   False       
process-graph     4005                   False       
integration-hub   4017                   False       
navigator-ai      4016                   False

# **📘 Mapping: Governing Principles → Subsystems**

## **Legend**
- **Primary responsibility** = subsystem owns this capability  
- **Secondary responsibility** = subsystem supports or provides data  
- **Boundary responsibility** = subsystem enforces or mediates  

---

# **📊 Full Mapping Table**

| **Principle** | **Capability** | **Subsystem(s)** | **Responsibility Type** | **Notes** |
|--------------|----------------|------------------|--------------------------|-----------|
| **1. AI Drives Execution** | Proposes actions at every step | **navigator-ai** | Primary | Uses MCP + Hypermedia to propose next actions |
| | Navigates the process graph | **navigator-ai**, **integration-hub**, **process-graph** | Primary (Navigator), Boundary (Hub), Source (PGE) | Navigator follows hypermedia links generated by Hub; PGE defines transitions |
| | Explains decisions | **navigator-ai** | Primary | Uses MCP metadata + process context |
| | Simulates outcomes | **navigator-ai** | Primary | Uses MCP schemas + historical patterns from CEP |
| **2. Humans Govern** | Approve actions | **governance-engine (Charter)**, **authority-engine**, **integration-hub** | Primary (Charter/Authority), Boundary (Hub) | Hub filters hypermedia links based on governance |
| | Provide authority | **authority-engine** | Primary | Authority engine determines permissions |
| | Correct errors | **navigator-ai**, **event-processor (CEP)**, **integration-hub** | Shared | Navigator identifies errors; CEP logs; Hub enforces corrections |
| | Trigger rollback/replay | **event-processor (CEP)**, **mesh-gateway** | Primary (CEP), Execution (Mesh) | CEP drives replay; Mesh replays commands |
| **3. Mesh Is the Constitutional Truth** | Records every event | **event-processor (CEP)**, **mesh-gateway** | Primary (CEP), Execution (Mesh) | CEP is the ledger; Mesh emits events |
| | Executes constitutional actions | **mesh-gateway**, **integration-hub** | Execution (Mesh), Boundary (Hub) | Hub validates; Mesh executes |
| | Governance enforcement occurs in Integration Hub | **integration-hub**, **governance-engine**, **authority-engine** | Boundary (Hub), Rules (Charter/Authority) | Hub applies governance before Mesh executes |
| | Supports rollback + replay | **event-processor (CEP)**, **mesh-gateway** | Primary | CEP stores events; Mesh replays |
| | Reconstructs ERP state | **mesh-gateway**, **event-processor (CEP)** | Primary | Mesh rebuilds state from events |
| **4. ERP Is a Projection** | Executes commands | **foundation-erp**, **vendor ERPs**, **mesh-gateway** | Execution (ERP), Orchestration (Mesh) | ERP is behind Mesh |
| | Posts transactions | **foundation-erp**, **vendor ERPs** | Primary | ERP writes transactional data |
| | Can be replaced or rebuilt | **mesh-gateway**, **integration-hub** | Boundary (Hub), Abstraction (Mesh) | Hub + Mesh ensure ERP-agnosticism |
| **5. UX Is Process First** | No roles | **navigator-ai**, **integration-hub** | Primary (Navigator), Boundary (Hub) | Navigator shows only allowed actions; roles are implicit via governance |
| | No menus | **navigator-ai** | Primary | Navigator presents next actions, not menus |
| | No modules | **navigator-ai**, **integration-hub** | Primary | Hypermedia removes module boundaries |
| | Only “what is possible next” | **integration-hub**, **navigator-ai**, **process-graph** | Boundary (Hub), Primary (Navigator), Source (PGE) | Hub generates governed hypermedia links; Navigator displays them |

---

# **🧭 Interpretation & Drift Check**

Here’s the quick read on whether the architecture matches the principles:

### **1. AI Drives Execution — Fully aligned**
Navigator owns all reasoning, simulation, and explanation.  
Integration Hub + PGE provide the constitutional constraints.

### **2. Humans Govern — Fully aligned**
Charter + Authority enforce governance.  
Integration Hub applies it at the boundary.

### **3. Mesh Is the Constitutional Truth — Corrected and aligned**
Mesh executes and emits events.  
CEP records them.  
Governance moved (correctly) to Integration Hub.

### **4. ERP Is a Projection — Fully aligned**
ERP is hidden behind Mesh and can be replaced.

### **5. UX Is Process First — Fully aligned**
Navigator + Hypermedia produce a pure process-first UX.

No drift detected.  
In fact, the architecture now **exceeds** the original principles by making them enforceable in code.


