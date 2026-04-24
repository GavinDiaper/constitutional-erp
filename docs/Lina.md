# **`linaUXDesign.md` — Lina UX Layer**  
### *A Vision‑First, Role‑Driven, Joystick‑Navigated Interface for the AI‑Native ERP*

---

# **1. Vision: ERP as a Playable World**

Lina is not a page.  
Lina is not a chat window.  
Lina is not a form generator.

**Lina is a *playable interface* for the ERP.**

Where traditional ERP forces users to:
- type  
- search  
- click through menus  
- remember codes  
- navigate tables  

Lina lets users:
- **choose a role**  
- **enter a mode**  
- **navigate with a joystick**  
- **select predicted actions**  
- **see the world as a graph**  
- **follow a quest‑like log**  

Lina turns ERP from a *database* into a *world*.

---

# **2. The Core Metaphor**

Lina is built on three metaphors:

### **1. Character**
The user chooses who they are:
- Project Manager  
- Buyer  
- Accountant  
- Warehouse  
- HR  
- Admin  

This sets:
- permissions  
- goals  
- likely tasks  
- default dashboards  
- default CAIPL prompts  

### **2. Mode**
The user chooses what they want to do:
- **Create** (new entity)  
- **Select** (existing entity)  
- **Investigate** (reporting)  
- **Fix** (exceptions)  
- **Advance** (workflow progression)  

This is the gameplay loop.

### **3. Joystick**
The user navigates:
- predicted actions  
- entity lists  
- decision options  
- graph nodes  
- notebook entries  

Typing is only used when absolutely required.

---

# **3. Lina’s UX Principles**

### **1. Minimal typing**
If Lina can predict it, the user should not type it.

### **2. Predictive surfaces**
Every screen shows:
- the most likely next actions  
- the most relevant entities  
- the most relevant questions  

### **3. Role‑driven**
The interface changes depending on the character.

### **4. Mode‑based**
The user always knows what mode they are in.

### **5. Joystick‑first**
Navigation is:
- directional  
- option‑based  
- fast  
- intuitive  

### **6. Visual grounding**
The graph and notebook are always present.

### **7. Constitutional**
Every action is:
- proposed by Lina  
- confirmed by the user  
- logged by the system  

---

# **4. Lina’s Structure (High‑Level)**

```
[ Lina UX Layer — Joystick, Roles, Modes, Predictions ]
                         ↓
[ Lina Engine (formerly CAIPL) — Planner, Interaction, Graph, Notebook, Governance ]
                         ↓
[ Navigation-AI — Intent Routing, MCP Tool Selection ]
                         ↓
[ MCP — Domain Actions ]
                         ↓
[ FoundationERP — Events, Identity, Governance ]
```

**Lina UX Layer** is a *presentation and interaction layer*.  
**Lina Engine** (formerly CAIPL) remains the *planning and orchestration engine*.

---

# **5. Lina UX Flow**

## **5.1 Start Screen — Character Selection**
User chooses:
- Project Manager  
- Buyer  
- Accountant  
- Warehouse  
- HR  
- Admin  

Lina Engine receives:
```
roleContext: "project_manager"
```

This influences:
- predicted actions  
- default modes  
- entity filters  
- plan templates  

---

## **5.2 Mode Selection**
Joystick moves through:

- **Create**  
- **Select**  
- **Investigate**  
- **Fix**  
- **Advance**  

Lina Engine receives:
```
mode: "create"
```

---

## **5.3 Action Prediction**
Lina Engine returns:
```
predictedActions: [
  { id: "create_project", label: "Create Project" },
  { id: "create_purchase_requisition", label: "Create Purchase Requisition" },
  { id: "create_invoice", label: "Create Invoice" }
]
```

Joystick selects one.

---

## **5.4 Entity Selection**
If mode = Select:
- Lina shows predicted entities  
- Joystick scrolls through them  
- Search is optional, not primary  

---

## **5.5 Interaction with Lina Engine**
Once an action is selected:
- Lina Engine generates decision points  
- Lina Engine generates forms  
- Lina Engine updates the graph  
- Lina Engine updates the notebook  

Joystick selects options.

Typing only occurs when:
- a field is required  
- no prediction is possible  

---

## **5.6 Graph + Notebook**
Always visible:
- Graph = world map  
- Notebook = quest log  

Joystick can:
- jump to nodes  
- open artefacts  
- inspect dependencies  

---

# **6. Lina UX Components**

## **6.1 Character Selector**
- Large cards  
- Role icons  
- Role descriptions  
- Joystick navigable  

## **6.2 Mode Selector**
- Horizontal wheel  
- Create / Select / Investigate / Fix / Advance  
- Joystick left/right  

## **6.3 Action Surface**
- Predicted actions  
- Ranked by Lina Engine  
- Joystick up/down  

## **6.4 Entity Surface**
- Predicted entities  
- Recent entities  
- Relevant entities  
- Joystick scroll  

## **6.5 Decision Surface**
- CAIPL decision points  
- Rendered as joystick‑selectable cards  

## **6.6 Form Surface**
- Only when required  
- Minimal fields  
- Predictive values  

## **6.7 Graph Panel**
- D3 graph  
- Highlighted nodes  
- Joystick moves focus  

## **6.8 Notebook Panel**
- Timeline  
- Artefacts  
- Notes  
- Documents  

---

# **7. Mapping Lina → Lina Engine (CAIPL)**

### **Joystick selection → decisionPoint.option selection**
```
POST /linaEngine/session/:id/turn
{
  selectedOptionId: "opt-create-project"
}
```

### **Mode selection → goal scaffolding**
```
POST /linaEngine/session
{
  role: "project_manager",
  mode: "create"
}
```

### **Character selection → role context**
```
roleContext: "buyer"
```

### **Entity selection → focus change**
```
currentFocus: { entityId: "project-123" }
```

### **Graph navigation → node inspection**
```
inspectNode: "node-456"
```

---

# **8. Responsive Behaviour**

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

Joystick works across all.

---

# **9. Implementation Phases**

### **Phase 1 — Add Lina UX Layer (no backend changes)**
- Character selector  
- Mode selector  
- Joystick navigation  
- Predicted action surface  

### **Phase 2 — Integrate with Lina Engine**
- Map joystick → CAIPL decision options  
- Map mode → CAIPL goals  
- Map character → CAIPL role context  

### **Phase 3 — Graph + Notebook Integration**
- D3 graph  
- Notebook timeline  

### **Phase 4 — Full Lina Gameplay Loop**
- Create  
- Select  
- Investigate  
- Fix  
- Advance  

---

# **10. Verification Gates**

1. Joystick navigation works across all surfaces  
2. Character selection influences predictions  
3. Mode selection influences CAIPL planning  
4. Graph updates reflect Lina Engine deltas  
5. Notebook updates reflect Lina Engine artefacts  
6. Minimal typing required  
7. Full constitutional governance preserved  

---
Don't forget to add the Lina UX layer to the startup scripts, Main Menu and documentation!

Clarifications

# **1. “Joystick” = Directional, Predictive, Option‑First Navigation**
In Lina, “joystick” means:

- The user moves **up/down/left/right** through predicted options  
- The UI presents **choices**, not blank fields  
- The user **selects**, not types  
- The AI **pre-fills**, not the user  
- The flow feels like **navigating a game menu**, not filling a form  

This is a **UX pattern**, not a hardware requirement.

It’s the opposite of:
- keyboard-heavy ERP  
- form-first UX  
- search-first UX  

It’s the embodiment of:
- **predictive surfaces**  
- **guided flow**  
- **minimal typing**  
- **role-based options**  

---

# **2. Why the metaphor works (and why devs will get it)**

Developers understand:
- directional navigation  
- option lists  
- focus states  
- predictive ranking  
- modal interfaces  

So when you say “joystick”, they should hear:

> “Primary navigation is directional selection of AI‑predicted options, not freeform typing.”

This is:
- easy to implement  
- easy to test  
- easy to extend  
- easy to reason about  

And it fits perfectly with the CAIPL/Lina Engine decision‑point model.

---

### **Lina UX Input Model**
Lina uses a **“joystick” metaphor for navigation**, meaning:

- The primary interaction is **selecting from AI‑predicted options**, not typing.  
- Users navigate options using **directional focus** (arrow keys, mouse, touch).  
- Typing is only required when **no prediction is possible** or when **explicit data entry is needed**.  
- Every surface (actions, entities, decisions, forms) is designed to be **option-first** and **directionally navigable**.  
- This is a **UX metaphor**, not a hardware requirement — standard mouse, keyboard, and touch interactions remain fully supported.

---

# **4. Why this fits Lina Engine perfectly**

The Lina Engine already outputs:
- decision options  
- predicted next steps  
- forms with fields  
- graph nodes  
- notebook entries  

All of these are **selectable objects**.

The joystick metaphor simply says:
> “Selection is the primary mode of interaction.”

This is exactly how the Lina Engine is designed to work.

---

# **5. Why this is the right UX for an AI‑native ERP**

Because:

- AI predicts → user selects  
- AI plans → user confirms  
- AI fills → user edits  
- AI suggests → user chooses  

Typing becomes the **exception**, not the default.

This is the future of enterprise UX.

---

