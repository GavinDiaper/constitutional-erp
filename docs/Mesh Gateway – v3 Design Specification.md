# 📘 **Mesh Gateway – v3 Design Specification (ERP‑Agnostic, Multi‑Adapter Architecture)**  
### *Constitutional Layer – Hypermedia Filtering, Execution Validation, and Orchestration*  
### *Node.js + TypeScript – Adapter‑based, ERP‑agnostic*

---

# **1. Purpose**

The Mesh Gateway is the **constitutional enforcement point** that sits between all clients (Navigator, UI, Integration Hub) and **any backend system that exposes business transitions**.

Its mission is to ensure that every read and write is:

- authority‑checked  
- governance‑checked  
- hypermedia‑filtered  
- explainable  
- deterministic  
- constitutional  

The Mesh is **ERP‑agnostic**.  
Backends (Foundation ERP, SAP, Oracle, Workday, etc.) are accessed through **pluggable adapters**.

---

# **2. Responsibilities**

### ✔ ERP‑agnostic proxy for business transitions  
Clients never call backend systems directly.

### ✔ Hypermedia filtering  
Remove or annotate transitions based on:

- authority  
- governance  
- SoD  
- risk  
- credentials  
- charter rules  

### ✔ Execution validation  
Before calling any backend adapter, Mesh must:

1. Call Authority Engine  
2. Call Governance Engine  
3. Enforce approvals  
4. Enforce escalations  
5. Enforce SoD  
6. Enforce risk constraints  

### ✔ Approval workflow orchestration  
Mesh owns approval tasks and routing.

### ✔ Constitutional event emission  
Mesh emits:

- MeshActionAllowed  
- MeshActionDenied  
- MeshHypermediaFiltered  
- MeshApprovalTaskCreated  
- MeshApprovalCompleted  

### ✔ Stateless, horizontally scalable  
Mesh holds no projections and performs no replay.

---

# **3. Architecture Overview**

```
Client (Navigator / UI / Integration Hub)
        │
        ▼
Mesh Gateway (ERP‑agnostic)
   - Hypermedia filter
   - Execution validator
   - Approval workflow
   - Adapter router
        │
        ├── Foundation ERP adapter (v1)
        ├── SAP adapter (future)
        ├── Oracle adapter (future)
        ├── Workday adapter (future)
        └── Custom adapters (future)
        │
        ├── Authority Engine
        └── Governance Engine
```

---

# **4. Multi‑Adapter Design**

## **4.1 Why adapters exist**
Adapters isolate backend‑specific details:

- URL structure  
- hypermedia format  
- action semantics  
- error formats  
- authentication  
- domain naming  

Mesh core remains **purely canonical**.

---

## **4.2 Adapter interface**

```ts
export interface BackendAdapter {
  id: string; // e.g. "foundation", "sap", "oracle"

  // Routing
  canHandle(meshPath: string): boolean;

  // Resource fetch
  fetchResource(
    meshPath: string,
    headers: Record<string, string>
  ): Promise<CanonicalResource>;

  // Action execution
  executeAction(
    meshPath: string,
    body: any,
    headers: Record<string, string>
  ): Promise<CanonicalActionResult>;
}
```

Adapters return **canonical** structures, not backend‑native ones.

---

## **4.3 Adapter registry**

Mesh maintains a registry:

```ts
const adapters: BackendAdapter[] = [
  foundationAdapter, // v1
  // sapAdapter,
  // oracleAdapter,
  // workdayAdapter,
];
```

Routing strategy (v1):

- First adapter whose `canHandle(meshPath)` returns true is selected.

Routing strategy (future):

- Domain‑based routing  
- Tenant‑based routing  
- Resource‑based routing  
- Migration routing (parallel ERPs)  
- Disaster recovery routing  

---

## **4.4 Multi‑adapter coexistence (future)**

The Mesh is designed to support:

### **A. Domain‑split ERPs**
- P2P → Oracle  
- R2R → SAP  
- H2R → Workday  
- O2C → Foundation ERP  

### **B. Tenant‑split ERPs**
- Company A → SAP  
- Company B → Foundation ERP  

### **C. Migration mode**
- Read from both ERPs  
- Write to new ERP  
- Validate against old ERP  

### **D. Disaster recovery**
- Failover to secondary ERP adapter  

**v1 does not implement multi‑adapter routing**,  
but the architecture is intentionally prepared for it.

---

# **5. Mesh API Surface (Canonical)**

Mesh exposes **canonical** routes, not backend‑specific ones.

### **Examples**

```
GET  /mesh/p2p/purchase-orders/PO-123
POST /mesh/p2p/requisitions/REQ-123/approve
POST /mesh/r2r/journals/JRN-123/post
POST /mesh/h2r/employees/EMP-123/terminate
```

Mesh determines which adapter to use based on:

- domain  
- resource type  
- path pattern  
- tenant (future)  

---

# **6. Hypermedia Filtering (Canonical)**

Adapters return **canonical hypermedia**:

```json
{
  "id": "PO-123",
  "domain": "P2P",
  "type": "purchase-order",
  "attributes": { ... },
  "links": {
    "issue": {
      "href": "/mesh/p2p/purchase-orders/PO-123/issue",
      "method": "POST"
    }
  }
}
```

Mesh applies:

- authority  
- governance  
- SoD  
- risk  

And removes or annotates links accordingly.

---

# **7. Execution Validation Pipeline**

1. **Actor identity**  
   - Explicit header required: `x-actor-id`.

2. **Context derivation**  
   - Mesh fetches resource via adapter.  
   - Applies per‑domain context builder.

3. **Authority check**  
4. **Governance check**  
5. **Decision precedence**  
6. **Execute action via adapter**  
7. **Emit constitutional events**

---

# **8. Approval Workflow (Mesh‑Owned)**

- States: `PENDING → APPROVED → EXECUTED` or `REJECTED`
- Created when Governance returns `requiresApproval` or `escalatedToTier`
- Approvers resolved via Authority Engine
- Execution performed via adapter

Approval workflow is **ERP‑agnostic**.

---

# **9. Constitutional Events**

Unchanged from previous spec:

- MeshHypermediaFiltered  
- MeshActionDenied  
- MeshApprovalTaskCreated  
- MeshApprovalCompleted  

---

# **10. Internal Storage**

Mesh stores only:

- approval tasks  
- approval assignments  
- decision logs  

Mesh stores **no projections** and performs **no replay**.

---

# **11. Startup Sequencing**

Mesh reports ready only when:

- Authority Engine is ready  
- Governance Engine is ready  
- At least one adapter is healthy  

---

# **12. Summary**

The Mesh Gateway is now explicitly:

- **ERP‑agnostic**  
- **adapter‑based**  
- **future‑proof**  
- **migration‑ready**  
- **BCM‑ready**  
- **aligned with constitutional architecture**  

v1 uses **only the Foundation ERP adapter**,  
but the design supports **multiple adapters**,  
**parallel ERPs**, and **domain‑level routing** in future phases.

---

