# **`cailpDesign.md` — Constitutional AI Interaction & Planning Layer (CAIPL)**  
### *Unified Architecture for Planning, Interaction, Governance, Persistence, and Visualisation*

---

# **1. Purpose**

CAIPL provides a **conversational, visual, and constitutional interface** where the AI can plan, guide, and execute multi‑step ERP processes through MCP — with full user control, auditability, and server‑side session persistence.

It replaces “AI chat” with a **governed, inspectable, resumable workspace**.

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

## **3.6 Persistence Layer**
- Stores sessions  
- Stores graph  
- Stores notebook  
- Stores decisions  
- Stores turns  

---

# **4. Session Persistence Model**

CAIPL sessions are **server‑side, resumable**, and identified by `sessionId`.

### **4.1 Session Entity**
```
{
  id: string,
  userId: string,
  createdAt: string,
  updatedAt: string,
  currentGoal: string,
  currentStepId: string | null,
  status: "active" | "archived"
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
{
  id: string,
  sessionId: string,
  type: string,
  options: DecisionOption[],
  status: "pending" | "confirmed" | "executing" | "executed" | "failed" | "escalated"
}
```

### **6.2 DecisionOption**
```
{
  id: string,
  label: string,
  description: string,
  actionPayload: object,
  inputSchema: InputSchema
}
```

### **6.3 InputSchema**
```
{
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

# **7. PlanGraph Contract**

### **7.1 PlanNode**
```
{
  id: string,
  type: "process_step" | "entity" | "decision" | "data_collection" | "mcp_action",
  label: string,
  metadata: object,
  status: "pending" | "active" | "completed" | "blocked" | "failed"
}
```

### **7.2 PlanEdge**
```
{
  from: string,
  to: string,
  type: "depends_on" | "leads_to" | "requires"
}
```

### **7.3 GraphDelta**
```
{
  addedNodes: PlanNode[],
  updatedNodes: PlanNode[],
  removedNodes: string[],
  addedEdges: PlanEdge[],
  removedEdges: string[]
}
```

### **7.4 Performance Constraints**
- Delta updates only  
- Max 300 nodes  
- 60fps desktop  
- 30fps mobile  
- D3 force simulation throttled  

---

# **8. Notebook Contract**

### **8.1 Artefact**
```
{
  id: string,
  type: "document" | "note" | "form" | "table",
  content: object | string,
  linkedNodeId: string
}
```

### **8.2 NotebookDelta**
```
{
  added: Artefact[],
  updated: Artefact[],
  removed: string[]
}
```

---

# **9. CAIPL Endpoints**

### **POST /caipl/session**
Create new session.

### **GET /caipl/session/:id**
Resume session.

### **POST /caipl/session/:id/turn**
User message or option selection.

### **POST /caipl/decision/:id/resolve**
Confirm/reject/amend.

---

# **10. Orchestration Boundaries**

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

### **MCP**
- Domain actions  
- Validation  

---

# **11. Responsive Layout Specification**

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

# **12. AI Workspace Route**

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

# **13. Implementation Phases**

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

# **14. Verification Gates**

1. navigator-ai compile/lint/tests pass  
2. ui-sveltekit compile/lint/tests pass  
3. Full session flow works  
4. Session resume works  
5. Existing Navigator flows unaffected  

---

# **15. Feature Flag**

CAIPL must ship behind a feature flag due to cross‑cutting impact.


