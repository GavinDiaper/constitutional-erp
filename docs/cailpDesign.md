# **Constitutional AI Interaction & Planning Layer (CAIPL)**  
### *Unified Architecture for AI‑Native UX, Planning, and Process Execution*

---

# **1. Purpose (one sentence)**

CAIPL provides a **conversational, visual, and constitutional interface** where the AI can plan, guide, and execute multi‑step ERP processes through MCP — with full user control, auditability, and structured decision points.

---

# **2. Position in the Stack**

```
[ Canvas UI ]
       ↑
[ CAIPL — Constitutional AI Interaction & Planning Layer ]  ← NEW
       ↑
[ Navigation-AI ]
       ↑
[ MCP / Process Engine ]
       ↑
[ FoundationERP (Identity, Events, Governance) ]
```

**CAIPL replaces the idea of “just chat” with a full interaction substrate.**

---

# **3. Why CAIPL Exists**

Because ERP processes are:
- multi-step  
- cross-domain  
- dependent on preconditions  
- requiring data collection  
- requiring governance  
- requiring audit  
- requiring user confirmation  

A raw LLM cannot reliably:
- plan  
- sequence  
- validate  
- visualise  
- collect data  
- call MCP safely  

CAIPL solves this.

---

# **4. Core Responsibilities of CAIPL**

### **4.1 Planning**
- Convert a goal (“Make a loaf of bread”) into a **plan graph**.
- Break into steps.
- Identify dependencies.
- Identify required data.
- Identify MCP actions.
- Identify constitutional boundaries.

### **4.2 Interaction**
- Maintain conversational state.
- Present decision points.
- Present forms.
- Present options.
- Present summaries.
- Present next steps.

### **4.3 Visualisation**
- Render a mind‑map of the plan.
- Render progress.
- Render dependencies.
- Render entities and relationships.

### **4.4 Execution**
- Only execute MCP actions after user confirmation.
- Log all events constitutionally.
- Update the graph and notebook.

### **4.5 Memory**
- Session memory only.
- Stores plan, graph, notebook, decisions, and user inputs.

---

# **5. CAIPL Internal Architecture**

## **5.1 Modules**

### **A. Planner Module**
- Goal → Plan Graph  
- Plan Graph → Steps  
- Steps → MCP Actions  
- Preconditions → Checks  
- Required Data → Forms  
- Boundaries → Confirmations  

### **B. Interaction Manager**
- Manages conversation turns.
- Manages decision points.
- Manages forms.
- Manages suggestions.
- Manages session memory.

### **C. Graph Manager**
- Stores nodes and edges.
- Updates graph as plan progresses.
- Links graph to conversation turns.
- Provides snapshots and deltas to UI.

### **D. Notebook Manager**
- Stores generated artefacts.
- Stores notes, documents, tables.
- Links artefacts to steps and entities.

### **E. Execution Manager**
- Calls MCP only after confirmation.
- Validates preconditions.
- Logs events to FoundationERP.

---

# **6. Data Model (Developer‑Ready)**

### **6.1 InteractionSession**
- id  
- user_id  
- created_at  
- updated_at  
- current_goal  
- current_step  
- status  

### **6.2 PlanGraph**
- nodes: array of PlanNode  
- edges: array of PlanEdge  

### **6.3 PlanNode**
- id  
- type (process_step | entity | decision | data_collection | mcp_action)  
- label  
- metadata (entity_id, process_step_id, etc.)  
- status (pending | active | completed | blocked)  

### **6.4 PlanEdge**
- from_node_id  
- to_node_id  
- type (depends_on | leads_to | requires)  

### **6.5 InteractionTurn**
- id  
- session_id  
- actor (user | ai | system)  
- message_text  
- linked_nodes  
- linked_artefacts  

### **6.6 DecisionPoint**
- id  
- session_id  
- type  
- options: [{ id, label, description, action_payload }]  
- status  

### **6.7 Artefact**
- id  
- type (document | note | form | table)  
- content  
- linked_node_id  

---

# **7. API Contracts (Backend → Frontend)**

### **7.1 Start Session**
`POST /caipl/session`

Returns:
- session  
- initial_turns  
- plan_graph (optional)  
- notebook_snapshot  

### **7.2 Send Message**
`POST /caipl/session/{id}/turn`

Returns:
- new_turns  
- decision_points  
- graph_delta  
- notebook_delta  

### **7.3 Resolve Decision**
`POST /caipl/decision/{id}/resolve`

Returns:
- updated_decision  
- graph_delta  
- notebook_delta  
- new_turns  

---

# **8. UI Specification (Developer‑Ready)**

### **8.1 New Page: AI Workspace**
Route: `/ai/workspace/:sessionId?`

### **Panels**

#### **Left: Conversation**
- Chat history  
- Suggested options  
- Inline forms  
- Inline confirmations  

#### **Right: Plan Graph**
- Nodes (steps, entities, decisions)  
- Edges (dependencies)  
- Status colours  
- Click to inspect  

#### **Bottom/Side: Notebook**
- Generated artefacts  
- Notes  
- Tables  
- Documents  

#### **Top Bar: Constitutional Controls**
- Confirm  
- Reject  
- Amend  
- View log  

---

# **9. How CAIPL Uses Navigation-AI and MCP**

### **Navigation-AI**
- Intent detection  
- Page/process mapping  
- Tool selection  

### **CAIPL**
- Planning  
- Interaction  
- Visualisation  
- Execution control  

### **MCP**
- Executes domain actions  
- Validates rules  
- Returns results  

### **FoundationERP**
- Logs events  
- Provides identity context  
- Enforces governance  

---

# **10. Developer Brief (Copy/Paste)**

> **We are implementing CAIPL — the Constitutional AI Interaction & Planning Layer.**
>
> It provides:
> - A planning engine (goal → plan graph → steps → MCP actions).  
> - A conversational interface with decision points and forms.  
> - A visual graph of the plan and progress.  
> - A notebook of generated artefacts.  
> - A constitutional execution model (AI proposes, user confirms, MCP executes).
>
> **Backend tasks:**
> 1. Add a new `caipl` module inside navigation-ai (modularised for future extraction).  
> 2. Implement:
>    - Planner  
>    - Interaction Manager  
>    - Graph Manager  
>    - Notebook Manager  
>    - Execution Manager  
> 3. Expose endpoints:
>    - `POST /caipl/session`  
>    - `POST /caipl/session/{id}/turn`  
>    - `POST /caipl/decision/{id}/resolve`  
> 4. Integrate with:
>    - Navigation-AI for intent routing  
>    - MCP for execution  
>    - FoundationERP for event logging  
>
> **Frontend tasks:**
> 1. Create `/ai/workspace/:sessionId?`.  
> 2. Implement:
>    - Chat panel  
>    - Graph panel  
>    - Notebook panel  
>    - Constitutional controls  
> 3. Bind UI to CAIPL endpoints.  
> 4. Support:
>    - Suggested options  
>    - Forms  
>    - Decision points  
>    - Graph updates  
>    - Notebook updates  

---

# **11. Final Check: Does CAIPL cover everything?**

### **Planning** — Yes  
### **Interaction** — Yes  
### **Visualisation** — Yes  
### **Execution** — Yes  
### **Governance** — Yes  
### **Memory** — Yes (session only)  
### **Sub-agents** — Not needed  
### **Skills substrate** — Included  

This is the cleanest, most constitutional, most buildable architecture.

