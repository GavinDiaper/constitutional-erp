# **📘 Updated Roadmap (Post–Integration Hub Implementation)**  
### *What to build next, in the correct order*

# **1. Phase C — Integration Hub v2 (Immediate Next Work)**  
**Why this is next:**  
Hub v1 exposes the constitutional API, but it needs full domain coverage and deeper metadata before Navigator can operate across all flows.

### **Objectives**
- Expand MCP catalog to all modeled domains  
- Expand Hypermedia coverage (Supplier, Req, PO, Invoice, Order, Payment)  
- Add governance annotations (risk, authority tier)  
- Add simulation hints for Navigator  
- Add event metadata passthrough  
- Add navlog + transcript passthrough  
- Add REPL‑friendly DTOs  

### **Outcome**
Navigator becomes fully model‑driven across all domains.

---

# **2. Phase D — Navigator v2 (AI Reasoning Upgrade)**  
**Why now:**  
Navigator can now rely on Integration Hub for constitutional truth.  
This frees Navigator to focus on reasoning quality.

### **Objectives**
- Replace all direct Mesh calls with Integration Hub calls  
- Improve ranking using MCP metadata  
- Improve simulation using Hypermedia hints  
- Improve explanation using governance metadata  
- Add multi‑step planning  
- Add improved transcript + navlog generation  

### **Outcome**
Navigator becomes a true constitutional agent.

---

# **3. Phase E — REPL v2 (Hub‑Native Developer Cockpit)**  
**Why now:**  
REPL must be updated to use the new constitutional API.

### **Objectives**
- Replace NavigatorClient with IntegrationHubClient  
- Add MCP discovery commands  
- Add Hypermedia navigation commands  
- Add governed action execution commands  
- Add event + navlog viewer  

### **Outcome**
REPL becomes the canonical debugging tool for the constitutional stack.

---

# **4. Phase F — Mesh Gateway v2 (Execution Hardening)**  
**Why now:**  
Navigator and Hub will soon drive full end‑to‑end flows.  
Mesh must be hardened to support them.

### **Objectives**
- Canonical → ERP mapping expansion  
- Unified error model  
- Idempotent execution  
- Retry/backoff/circuit breaker  
- ERP‑agnostic execution semantics  
- Strong correlation IDs  
- Adapter contract tightening  

### **Outcome**
Mesh becomes a reliable execution substrate for constitutional actions.

---

# **5. Phase G — Process Graph Engine v2 (Full Domain Coverage)**  
**Why now:**  
Navigator can only propose what PGE exposes.  
Hub can only generate hypermedia for what PGE defines.

### **Objectives**
- Full lifecycle coverage for:
  - Supplier  
  - Requisition  
  - PO  
  - Invoice  
  - Payment  
  - Sales order  
  - Journal  
  - Employee  
- Add risk annotations  
- Add approval annotations  
- Add simulation hints  
- Add multi‑step transitions  

### **Outcome**
Navigator can navigate every major business process.

---

# **6. Phase H — Foundation ERP v2 (Domain Capability Growth)**  
**Why now:**  
ERP is a projection, but it must support the canonical model.

### **Objectives**
- Add missing domain capabilities  
- Align events with canonical model  
- Strengthen validation  
- Improve reference data  
- Improve test data generation  

### **Outcome**
ERP becomes a clean projection behind Mesh.

---

# **7. Phase I — Canvas v1 (Process‑First UX)**  
**Why now:**  
Navigator + Hub + PGE now provide the full constitutional surface.

### **Objectives**
- State viewer  
- Navigator proposals  
- Explanations  
- Simulations  
- Approvals  
- Execution  
- Event history  
- Dashboards  

### **Outcome**
Canvas becomes the human cockpit for the constitutional platform.

---

# **8. Phase J — Distributed Fabric v1 (Continuity Layer)**  
**Why now:**  
Once the core stack is stable, we add resilience and multi‑ERP capability.

### **Objectives**
- Event propagation  
- Multi‑ERP continuity  
- Distributed replay  
- Node identity + trust  
- Distributed locks  
- Causal ordering  

### **Outcome**
The platform becomes resilient and horizontally scalable.

---

# **9. Phase K — Authority Engine v1 (Earned Authority)**  
**Why now:**  
Navigator and Hub now rely heavily on governance metadata.

### **Objectives**
- Authority tiers  
- Credential issuance  
- Behavioural scoring  
- Decay + revocation  
- Domain‑specific trust  

### **Outcome**
Governance becomes dynamic and earned.

---

# **10. Phase L — Charter Engine v2 (Constitutional Hardening)**  
**Why now:**  
Navigator and Hub need richer governance rules.

### **Objectives**
- SoD rules  
- Risk thresholds  
- Approval rules  
- Domain constraints  
- Constitutional invariants  
- Rule simulation  
- Rule explainability  

### **Outcome**
Governance becomes transparent, auditable, and constitutional.

---

# **11. Phase M — End‑to‑End Testing Infrastructure**  
**Why now:**  
The system is now complex enough to require full E2E validation.

### **Objectives**
- Automated flows  
- PGE replay  
- CEP validation  
- Mesh adapter mocks  
- Visual test runner  

### **Outcome**
The platform becomes testable and observable.

---

# **12. Phase N — Simulation Engine v2**  
**Why now:**  
Navigator now has the data and structure to support deeper simulation.

### **Objectives**
- Multi‑step forecasting  
- Financial impact modelling  
- Supplier risk modelling  
- Scenario comparison  

### **Outcome**
Navigator becomes predictive, not just reactive.

---

# **13. Phase O — Learning Loop v1**  
**Why now:**  
Once enough data exists, the platform can self‑improve.

### **Objectives**
- Prompt evaluation  
- Decision scoring  
- Simulation accuracy scoring  
- Governance prediction accuracy  
- Human override analysis  

### **Outcome**
The platform becomes self‑optimizing.

---

# **📌 Summary: What to Build Next**

Now that Integration Hub v1 is complete, the next subsystem to build is:

# **👉 Integration Hub v2 (full domain coverage + governance + simulation hints)**

This unlocks:

- Navigator v2  
- REPL v2  
- Canvas v1  
- Mesh v2  
- PGE v2  

Everything else depends on this.
