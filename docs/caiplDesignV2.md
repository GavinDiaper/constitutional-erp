# **`cailpDesign.md` — Constitutional AI Interaction & Planning Layer (CAIPL)**  
### *Unified Architecture for Planning, Interaction, Governance, Persistence, Concurrency, and Visualisation*

---

# **1. Purpose**

CAIPL provides a **conversational, visual, governed, and resumable AI workspace** for planning and executing multi‑step ERP processes through MCP.  
It replaces traditional “AI chat” with a **constitutional cockpit** that ensures:

- Predictability  
- Auditability  
- Governance  
- User control  
- Session persistence  
- Multi‑surface consistency  

---

# **2. Position in the Stack**

```
[ Canvas UI ]
       ↑
[ CAIPL — Constitutional AI Interaction & Planning Layer ]
       ↑
[ Navigation-AI ]
       ↑
[ MCP / Process Engine ]
       ↑
[ FoundationERP (Identity, Events, Governance) ]
```

---

# **3. Responsibilities**

## **3.1 Planner**
- Goal → PlanGraph  
- Steps → MCP actions  
- Dependencies → Edges  
- Required data → InputSchema  
- Governance → State machine  

## **3.2 Interaction Manager**
- Conversation turns  
- Suggested options  
- Decision points  
- Form rendering  
- Session memory  

## **3.3 Graph Manager**
- Stores PlanGraph  
- Applies deltas  
- Links nodes to turns  
- Provides snapshots  

## **3.4 Notebook Manager**
- Stores artefacts  
- Links artefacts to nodes  
- Provides deltas  

## **3.5 Execution Manager**
- Applies governance state machine  
- Calls MCP  
- Logs events  
- Handles failures/escalations  
- Applies version checks  

## **3.6 Persistence Layer**
- Stores sessions  
- Stores graph  
- Stores notebook  
- Stores decisions  
- Stores turns  
- Stores version counters  

---

# **4. Session Persistence Model**

CAIPL sessions are **server‑side, resumable**, and identified by `sessionId`.

### **4.1 Session Entity**
```
Session {
  id: string,
  userId: string,
  createdAt: string,
  updatedAt: string,
  currentGoal: string,
  currentStepId: string | null,
  status: "active" | "archived",
  version: number        // optimistic concurrency control
}
```

### **4.2 Persistence Requirements**
- Sessions persist across browser refreshes  
- Sessions can be resumed via `/ai/workspace/:sessionId`  
- All state surfaces (chat, graph, notebook, decisions) must restore  

---

# **5. Governance State Machine**

### **5.1 States**
- `pending`
- `confirmed`
- `executing`
- `executed`
- `failed`
- `escalated`

### **5.2 Transitions**
```
pending → confirmed
confirmed → executing
executing → executed
executing → failed
failed → escalated
escalated → resolved (manual)
```

### **5.3 Error Handling**
- MCP errors → `failed`  
- Validation errors → `failed`  
- Governance violations → `escalated`  
- User can amend or retry  

---

# **6. DecisionPoint Contract (Updated)**

### **6.1 DecisionPoint**
```
DecisionPoint {
  id: string,
  sessionId: string,
  type: string,
  options: DecisionOption[],
  status: "pending" | "confirmed" | "executing" | "executed" | "failed" | "escalated",
  resolvedBy: string | null,   // userId or "system"
  resolvedAt: string | null,   // ISO timestamp
  version: number              // optimistic concurrency control
}
```

### **6.2 DecisionOption**
```
DecisionOption {
  id: string,
  label: string,
  description: string,
  actionPayload: object,
  inputSchema: InputSchema
}
```

### **6.3 InputSchema**
```
InputSchema {
  fields: [
    {
      id: string,
      label: string,
      type: "string" | "number" | "date" | "enum" | "entityRef",
      required: boolean,
      options?: array
    }
  ]
}
```

### **6.4 Validation**
- Backend validates inputSchema before MCP execution  
- UI renders forms based on inputSchema  
- Errors return structured validation messages  

---

# **7. Concurrency & Multi‑Tab Safety**

CAIPL must prevent stale submissions from multiple tabs or devices.

### **7.1 Versioning**
- Every session update increments `session.version`  
- Every decision update increments `decision.version`  

### **7.2 Client Responsibilities**
- UI sends the last-known version with every write operation  

### **7.3 Backend Responsibilities**
If `submittedVersion < storedVersion`, backend returns:

```
409 Conflict
{
  error: "VERSION_MISMATCH",
  message: "The decision or session has already been updated.",
  currentVersion: <number>
}
```

### **7.4 UI Behavior**
- Refresh state surfaces  
- Re-render graph, notebook, decisions  
- Notify user of updated state  

---

# **8. PlanGraph Contract**

### **8.1 PlanNode**
```
PlanNode {
  id: string,
  type: "process_step" | "entity" | "decision" | "data_collection" | "mcp_action",
  label: string,
  metadata: object,
  status: "pending" | "active" | "completed" | "blocked" | "failed"
}
```

### **8.2 PlanEdge**
```
PlanEdge {
  from: string,
  to: string,
  type: "depends_on" | "leads_to" | "requires"
}
```

### **8.3 GraphDelta**
```
GraphDelta {
  addedNodes: PlanNode[],
  updatedNodes: PlanNode[],
  removedNodes: string[],
  addedEdges: PlanEdge[],
  removedEdges: string[]
}
```

### **8.4 Performance Constraints**
- Delta updates only  
- Max 300 nodes  
- 60fps desktop  
- 30fps mobile  
- D3 force simulation throttled  

---

# **9. Notebook Contract**

### **9.1 Artefact**
```
Artefact {
  id: string,
  type: "document" | "note" | "form" | "table",
  content: object | string,
  linkedNodeId: string
}
```

### **9.2 NotebookDelta**
```
NotebookDelta {
  added: Artefact[],
  updated: Artefact[],
  removed: string[]
}
```

---

# **10. CAIPL Endpoints**

### **POST /caipl/session**
Create new session.

### **GET /caipl/session/:id**
Resume session.

### **POST /caipl/session/:id/turn**
User message or option selection.

### **POST /caipl/decision/:id/resolve**
Confirm/reject/amend.

All write endpoints must enforce version checks.

---

# **11. Orchestration Boundaries**

### **Navigator-AI**
- Intent detection  
- Ranking  
- Page/process mapping  
- MCP tool selection  

### **CAIPL**
- Planning  
- Interaction  
- Graph  
- Notebook  
- Governance  
- Execution orchestration  
- Versioning  
- Persistence  

### **MCP**
- Domain actions  
- Validation  

---

# **12. Responsive Layout Specification**

### **Desktop (≥1024px)**
- 3 panels  
  - Left: Conversation  
  - Center: Graph  
  - Right: Notebook  

### **Tablet (768–1023px)**
- 2 panels  
  - Chat + Graph  
  - Notebook via tab  

### **Mobile (<768px)**
- 1 panel  
- Bottom nav: Chat / Graph / Notebook  

---

# **13. AI Workspace Route**

### **Route**
`/ai/workspace/:sessionId?`

### **Panels**
- Conversation  
- Graph (D3)  
- Notebook  
- Constitutional controls  

### **Entry Points**
- Navigator  
- Homepage  

---

# **14. Feature Flag Strategy**

- CAIPL is gated at the **UI route level** (`/ai/workspace`).  
- This is a **UX gating mechanism**, not a security boundary.  
- CAIPL API endpoints remain reachable for internal/testing use.  
- Backend feature flagging may be added in v2 for tenant-level isolation if required.  

---

# **15. Implementation Phases**

### **Phase 1 — Contract Hardening**
- Update this document  
- Lock schemas, endpoints, state machine, responsive rules  

### **Phase 2 — Backend CAIPL Module**
- Add CAIPL modules inside navigator-ai  
- Add persistence  
- Add endpoints  

### **Phase 3 — UI Proxy + Typed Client**
- Add proxy endpoints  
- Add CAIPL client/types  

### **Phase 4 — AI Workspace Route**
- Build responsive UI  
- Integrate D3 graph  
- Integrate notebook  

### **Phase 5 — Entry Points**
- Add navigation from homepage + Navigator  

### **Phase 6 — Testing**
- Backend tests  
- Frontend tests  
- Integrated session flow tests  

---

# **16. Verification Gates**

1. navigator-ai compile/lint/tests pass  
2. ui-sveltekit compile/lint/tests pass  
3. Full session flow works  
4. Session resume works  
5. Concurrency protections work  
6. Existing Navigator flows unaffected  

---

# **End of Document**
