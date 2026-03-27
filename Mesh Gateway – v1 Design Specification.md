# **📘 Mesh Gateway – v1 Design Specification**  
### *Constitutional ERP – Hypermedia Filtering, Execution Validation, and Orchestration Layer*  
### *Node.js + TypeScript*

---

# **1. Purpose**

The Mesh Gateway sits between all clients and any backend system that exposes business transitions.
Foundation ERP is the first backend adapter, but the Mesh is ERP-agnostic by design.

Backend systems are integrated via pluggable adapters.
Each adapter maps backend hypermedia and actions into the canonical constitutional model.


Its job is to ensure that **every read and every write** is:

- authority‑checked  
- governance‑checked  
- hypermedia‑filtered  
- explainable  
- deterministic  
- constitutional  

The Mesh is the **only** component that talks directly to backend adapters.

---

# **2. Responsibilities**

### ✔ ERP-agnostic proxy for business transitions  
Clients never call backend systems directly.

### ✔ Filter hypermedia responses  
Remove forbidden transitions based on:

- authority  
- governance  
- SoD  
- risk  
- credentials  
- charter rules  

### ✔ Validate all execution requests  
Before calling any backend adapter, the Mesh must:

1. Call Authority Engine  
2. Call Governance Engine  
3. Enforce approvals  
4. Enforce escalations  
5. Enforce SoD  
6. Enforce risk constraints  

### ✔ Route approval workflows  
When Governance returns `requiresApproval` or `escalatedToTier`, the Mesh:

- resolves eligible approvers (via Authority Engine)  
- creates approval tasks  
- waits for approval  
- re‑evaluates governance  
- executes the action if approved  

### ✔ Emit constitutional events  
- MeshActionAllowed  
- MeshActionDenied  
- MeshHypermediaFiltered  
- MeshApprovalTaskCreated  
- MeshApprovalCompleted  

### ✔ Support replay and deterministic behavior  
Mesh decisions must be reproducible.

---

# **3. Architecture Overview**

```
Client (Navigator/UI/Integration Hub)
        │
        ▼
Mesh Gateway
   - Hypermedia filter
   - Execution validator
   - Approval workflow
        │
        ├── Authority Engine (/authority/check)
        ├── Governance Engine (/governance/evaluate)
        ▼
Backend adapters (Foundation v1, SAP/Oracle/Workday future)
```

---

# **4. High‑Level Flow**

## **4.1 Read Path (GET)**

1. Client requests a resource:
   ```
   GET /mesh/p2p/purchase-orders/PO-123
   ```

2. Mesh selects an adapter and forwards to the backend:
   ```
   GET /api/v1/p2p/purchase-orders/PO-123
   ```

3. Adapter returns canonical resource hypermedia.

4. Mesh iterates over each `_link`:
   - calls Authority Engine  
   - calls Governance Engine  
   - removes forbidden transitions  
   - annotates transitions requiring approval  

5. Mesh returns filtered hypermedia to client.

---

## **4.2 Write Path (POST)**

1. Client requests an action:
   ```
   POST /mesh/p2p/purchase-orders/PO-123/issue
   ```

2. Mesh constructs an evaluation request:
   - actorId  
   - action  
   - domain  
   - context (e.g., PO amount)  

3. Mesh calls Authority Engine.

4. Mesh calls Governance Engine.

5. Mesh applies decision precedence:
   - Deny → return 403  
   - RequiresApproval → create approval task  
   - Escalate → route to higher tier approvers  
  - Allow → call adapter executeAction  

6. Mesh emits constitutional events.

7. Mesh returns final result to client.

---

# **5. Mesh API Surface**

The Mesh exposes canonical routes under `/mesh/*`.

### **Examples**

```
GET  /mesh/o2c/quotes/Q-123
POST /mesh/p2p/requisitions/REQ-123/approve
POST /mesh/r2r/journals/JRN-123/post
POST /mesh/h2r/employees/EMP-123/terminate
```

### **Approval Workflow Endpoints**

```
POST /mesh/approvals/:taskId/approve
POST /mesh/approvals/:taskId/reject
GET  /mesh/approvals?actorId=EMP-777
```

---

# **6. Hypermedia Filtering Specification**

### **Input**
- Canonical resource response from adapter  
- Actor identity  
- Authority decision  
- Governance decision  

### **Output**
- Filtered `links`  
- Annotated transitions  

### **Filtering Rules**

1. If Authority denies → remove link  
2. If Governance denies → remove link  
3. If Governance requires approval → annotate:
   ```json
   {
     "requiresApproval": true,
     "requiredApproverTier": 3
   }
   ```
4. If Governance escalates → annotate:
   ```json
   {
     "escalatedToTier": 4
   }
   ```

### **Example Filtered Link**
```json
"issue": {
  "href": "/mesh/p2p/purchase-orders/PO-123/issue",
  "method": "POST",
  "requiresApproval": true,
  "requiredApproverTier": 3
}
```

---

# **7. Execution Validation Pipeline**

### **Step 1 — Authority Check**
```
POST /authority/check
```

### **Step 2 — Governance Check**
```
POST /governance/evaluate
```

### **Step 3 — Decision Precedence**
1. Deny → return 403  
2. RequiresApproval → create approval task  
3. Escalate → create escalated approval task  
4. Allow → call adapter executeAction  

### **Step 4 — Execute Action**
Mesh calls the selected adapter only if allowed.

---

# **8. Approval Workflow**

### **8.1 Creating an approval task**
When Governance returns:

```json
{
  "requiresApproval": true,
  "requiredApproverTier": 3
}
```

Mesh:

1. Calls Authority Engine:
   ```
   GET /authority/eligible-approvers?tier=3&domain=P2P
   ```
2. Creates a task:
   ```json
   {
     "taskId": "TASK-999",
     "approvers": ["EMP-777", "EMP-888"],
     "action": "issue",
     "domain": "P2P",
     "context": { "poId": "PO-123" }
   }
   ```
3. Emits `MeshApprovalTaskCreated`.

### **8.2 Approver completes task**
Approver calls:

```
POST /mesh/approvals/TASK-999/approve
```

Mesh:

- re‑evaluates governance  
- executes action if allowed  
- emits `MeshApprovalCompleted`  

---

# **9. Constitutional Events Emitted by Mesh**

### **MeshHypermediaFiltered**
```json
{
  "event_type": "MeshHypermediaFiltered",
  "payload": {
    "resource": "/p2p/purchase-orders/PO-123",
    "removedTransitions": ["issue"],
    "actorId": "EMP-123"
  }
}
```

### **MeshActionDenied**
```json
{
  "event_type": "MeshActionDenied",
  "payload": {
    "actorId": "EMP-123",
    "action": "approve",
    "domain": "P2P",
    "reason": "SelfApprovalNotAllowed"
  }
}
```

### **MeshApprovalTaskCreated**
```json
{
  "event_type": "MeshApprovalTaskCreated",
  "payload": {
    "taskId": "TASK-999",
    "requiredTier": 3
  }
}
```

---

# **10. Internal Storage**

### **Tables**
- `mesh_approval_task`
- `mesh_approval_assignment`
- `mesh_decision_log`
- `mesh_projection_metadata`

### **v1 storage**
- SQLite or Postgres

---

# **11. Startup Sequencing**

### **Mesh MUST NOT start until:**
- Authority Engine is ready  
- Governance Engine is ready  
- At least one adapter is healthy  

### **Mesh readiness endpoint**
```
GET /mesh/ready
```

Returns 503 until all dependencies are ready.

---

# **12. Integration Tests (v1)**

### **Must cover:**
- authority denied  
- governance denied  
- self‑approval denied  
- threshold approval required  
- escalation required  
- risk flag annotation  
- hypermedia filtering  
- approval workflow end‑to‑end  

---

# **13. Summary**

The Mesh Gateway is the **constitutional enforcement point** that:

- filters hypermedia  
- validates execution  
- orchestrates approvals  
- enforces governance  
- enforces authority  
- emits constitutional events  
- protects the ERP  
- protects the enterprise  
- protects the AI  

This specification gives your developers everything they need to implement the Mesh as a standalone Node.js service.


