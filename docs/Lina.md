Absolutely — here is the **fully integrated, developer‑ready technical design document** with the **D3 graph implementation included cleanly and formally**.  
This version is safe to hand directly to the engineering team.  
It contains **no metaphor**, **no vision language**, **no narrative**, and **no ambiguity** — only actionable specifications.

I’ve merged the D3 graph modes, layouts, and technical constraints directly into the existing Lina vNext design structure.

---

# **`linaDesign_vNext.md` — Lina UX Layer (Technical Addendum to CAIPL Engine)**  
### *Technical Specification for the Lina Interaction Layer, Including D3 Graph Implementation*

---

# **1. Purpose**

Lina is a new interaction layer that sits on top of the existing CAIPL Engine.  
It introduces a **directional, option‑first, low‑typing UX** designed for desktop, tablet, and mobile.

Lina does **not** modify CAIPL Engine contracts, governance, persistence, or endpoints.  
Lina consumes CAIPL Engine outputs and presents them through a structured, predictable UI.

---

# **2. Scope**

This document defines:

- Lina’s interaction model  
- Lina’s UI components  
- Lina’s navigation rules  
- Lina’s mapping to CAIPL Engine endpoints  
- Lina’s D3 graph implementation (three modes)  
- Lina’s responsive behaviour  
- Lina’s technical constraints  

This document does **not** change CAIPL Engine behaviour.

---

# **3. UX Problems in Current CAIPL Workspace (to avoid)**

Lina explicitly avoids the following issues:

1. Excessive confirmation prompts  
2. No predictive suggestions  
3. Non-functional graph (force-directed line)  
4. Cluttered layout, not mobile-friendly  
5. Inconsistent session start flow  
6. No entity inspection after creation  
7. No loading indicators  
8. No developer console for debugging  

These are addressed by Lina’s new interaction model.

---

# **4. Interaction Model**

Lina uses a **directional, option‑based navigation model**.

### **4.1 Input Model**
- Primary interaction is **selecting from predicted options**.  
- Navigation is **directional focus movement** (arrow keys, mouse, touch).  
- Typing is only required when CAIPL inputSchema demands it.  
- All surfaces must be navigable without freeform text entry.

### **4.2 Role Context**
User selects a role:
```
roleContext: "<role>"
```

### **4.3 Mode Context**
User selects a mode:
```
mode: "<mode>"
```

### **4.4 Predicted Actions**
CAIPL Engine returns:
```
predictedActions: ActionOption[]
```

Lina renders these as selectable option cards.

---

# **5. UI Components**

### **5.1 Role Selector**
- Grid of selectable role cards  
- Directional navigation  
- Sets roleContext  

### **5.2 Mode Selector**
- Horizontal mode wheel  
- Directional navigation  
- Sets mode  

### **5.3 Action Surface**
- List/grid of predicted actions  
- Directional navigation  
- Maps to CAIPL decision options  

### **5.4 Entity Surface**
- Predicted entities  
- Recent entities  
- Relevant entities  
- Directional navigation  

### **5.5 Decision Surface**
- Renders CAIPL decisionPoint.options  
- Directional navigation  
- Minimal typing  

### **5.6 Form Surface**
- Renders CAIPL inputSchema  
- Predictive values where possible  
- Minimal typing  

### **5.7 Graph Panel**
**Implemented using D3 (see Section 6).**

### **5.8 Notebook Panel**
- Timeline of CAIPL artefacts  
- Directional navigation  

### **5.9 Developer Console (toggleable)**
Shows:
- LLM prompts  
- LLM responses  
- MCP calls  
- Errors  
- Execution timings  

---

# **6. D3 Graph Implementation (Integrated Specification)**

Lina implements **three D3-based graph modes**, selected based on user mode and context.

---

## **6.1 Graph Mode 1 — Plan View (Primary Graph)**  
### **Purpose**
Visualise CAIPL Engine’s plan graph:
- steps  
- dependencies  
- next actions  
- blockers  
- execution state  

### **Model**
**Directed Acyclic Graph (DAG)**

### **Layout**
- `d3-dag`  
- Sugiyama layered layout  
- Left → right flow  
- Deterministic node placement  

### **Node Types**
- process_step  
- decision  
- data_collection  
- mcp_action  
- entity  

### **Node Status Colours**
- pending  
- active  
- completed  
- blocked  
- failed  

### **Interactions**
- Directional navigation between nodes  
- Node inspection triggers CAIPL inspection  
- Highlight next actionable nodes  
- Auto-focus newly created entities  

### **Performance Constraints**
- Max 300 nodes  
- Delta updates only  
- 60fps desktop, 30fps mobile  

---

## **6.2 Graph Mode 2 — Explore View (Entity Narrowing)**  
### **Purpose**
Support narrowing workflows such as:
- SKU selection  
- Category → Subcategory → Item  
- Project → Task → Subtask  
- Supplier → Contract → Order  

### **Model**
**Radial Tree**

### **Layout**
- `d3.cluster()`  
- Circular layout  
- Parent → child expansion  

### **Interactions**
- Directional navigation between branches  
- Expand/collapse nodes  
- Select entity to focus CAIPL Engine  

### **Performance Constraints**
- Max depth: 5  
- Max branching factor: 20  

---

## **6.3 Graph Mode 3 — Status View (Workflow / WIP)**  
### **Purpose**
Visualise workflow states:
- approvals  
- exceptions  
- WIP  
- “Fix” mode  

### **Model**
**Kanban-style column layout**

### **Layout**
- Custom D3 group layout  
- Columns represent workflow states  
- Cards represent entities or steps  

### **Interactions**
- Directional navigation between columns  
- Select card to inspect  
- Drag-to-advance (optional future enhancement)  

### **Performance Constraints**
- Max 200 cards  
- Smooth transitions between columns  

---

## **6.4 Graph Mode Selection Logic**

| User Mode     | Graph Mode     |
|---------------|----------------|
| create        | Explore View   |
| select        | Explore View   |
| investigate   | Plan View      |
| fix           | Status View    |
| advance       | Plan View      |

---

# **7. Mapping Lina → CAIPL Engine**

### **7.1 Selecting an action**
```
POST /caipl/session/:id/turn
{
  selectedOptionId: "<id>"
}
```

### **7.2 Submitting a form**
```
POST /caipl/decision/:id/resolve
{
  choiceId: "<id>",
  formData: { ... },
  version: <clientVersion>
}
```

### **7.3 Inspecting an entity**
```
POST /caipl/session/:id/turn
{
  inspectEntityId: "<entityId>"
}
```

### **7.4 Inspecting a graph node**
```
POST /caipl/session/:id/turn
{
  inspectNodeId: "<nodeId>"
}
```

---

# **8. Concurrency & Versioning**

Lina must include version numbers in all write operations.

### **8.1 Session Version**
```
session.version: number
```

### **8.2 Decision Version**
```
decision.version: number
```

### **8.3 Backend behaviour**
If stale:
```
409 VERSION_MISMATCH
```

### **8.4 UI behaviour**
- Refresh state  
- Re-render surfaces  
- Notify user  

---

# **9. Responsive Behaviour**

### **Desktop**
- Left: Action Surface  
- Center: Graph  
- Right: Notebook  

### **Tablet**
- Action + Graph  
- Notebook via tab  

### **Mobile**
- Single panel  
- Bottom nav: Actions / Graph / Notebook  

---

# **10. Feature Flag Strategy**

- Lina is gated at the **UI route level**.  
- This is a **UX gating mechanism**, not a security boundary.  
- CAIPL Engine endpoints remain reachable.  
- Backend gating may be added in v2 if required.

---

# **11. Implementation Plan**

### **Phase 1 — Add Lina UX Layer**
- Role selector  
- Mode selector  
- Action surface  
- Directional navigation  

### **Phase 2 — Integrate with CAIPL Engine**
- Map directional navigation → CAIPL decision options  
- Map role/mode → CAIPL context  

### **Phase 3 — Implement D3 Graph Modes**
- DAG (Plan View)  
- Radial Tree (Explore View)  
- Kanban (Status View)  

### **Phase 4 — Notebook Integration**
- Artefact timeline  
- Entity-linked artefacts  

### **Phase 5 — Developer Console**
- LLM prompts  
- MCP calls  
- Errors  

### **Phase 6 — Mobile Optimisation**
- Single-panel mode  
- Bottom navigation  

---

# **12. Verification Gates**

1. Directional navigation works across all surfaces  
2. Role selection influences predictions  
3. Mode selection influences CAIPL planning  
4. All three D3 graph modes function correctly  
5. Graph updates reflect CAIPL deltas  
6. Notebook updates reflect CAIPL artefacts  
7. Minimal typing required  
8. Full CAIPL governance preserved  
9. Concurrency protections work  

---
Don't forget to include a menu item for Lina in the Navigator sidebar, for the new page created for Lina.

# **End of Document**
