# UI

## clean, modern, constitutional SvelteKit Canvas UI architecture

This is the architecture I would choose if I were building the UI for ConstitutionalERP myself — elegant, reactive, D3‑native, and visually aligned with your palette.

Folder name: ConstitutionalERP-UI-SvelteKit
Folder path: 


Below is the full architecture, broken into:

- **1. High‑level architecture**
- **2. Routing structure**
- **3. Component architecture**
- **4. Store architecture**
- **5. API client layer**
- **6. D3 integration strategy**
- **7. Theming (your color palette)**
- **8. Directory structure**
- **9. Canvas dashboard layout**

Everything is designed around the fact that **the UI now talks only to Integration Hub**.

---

# **1. High‑Level Architecture**

### **Framework**
- **SvelteKit** (modern, reactive, fast)
- Built‑in routing
- Built‑in server endpoints
- Vite under the hood

### **Styling**
- **TailwindCSS** (modern utility styling)
- Custom theme using your palette

### **Visualisation**
- **D3.js** for:
  - Process graphs
  - Event timelines
  - Navlog timelines
  - State dashboards

### **State Management**
- Svelte stores:
  - `actorStore`
  - `entityStore`
  - `processStore`
  - `navigatorStore`
  - `dashboardStore`

### **Data Source**
- **Integration Hub only**
  - `/process/:entity/:id`
  - `/mcp/functions`
  - `/hub/sessions`
  - `/hub/sessions/:id/navlog`
  - `/hub/sessions/:id/transcript`

### **Actor Selection**
- No login screen  
- A simple dropdown:
  - `principal.system`
  - `actor.ap`
  - `actor.sales`
  - etc.

---

# **2. Routing Structure (SvelteKit)**

```
src/routes/
  +page.svelte                → Home / Dashboard
  canvas/
    +layout.svelte           → Canvas shell
    +page.svelte             → Canvas landing
    [entityType]/
      [entityId]/
        +page.svelte         → Entity process view
  navigator/
    sessions/
      +page.svelte           → List sessions
      [sessionId]/
        +page.svelte         → Session detail (navlog + transcript)
  admin/
    +layout.svelte           → Admin shell
    +page.svelte             → Admin dashboard
    mcp/
      +page.svelte           → MCP catalog viewer
    hypermedia/
      +page.svelte           → Hypermedia inspector
    events/
      +page.svelte           → Event stream viewer
    graphs/
      +page.svelte           → PGE graph viewer
```

---

# **3. Component Architecture**

### **Canvas Components**
```
src/lib/components/canvas/
  EntityHeader.svelte
  EntityOverview.svelte
  ProcessGraph.svelte
  NavigatorPanel.svelte
  SimulationPanel.svelte
  EventTimeline.svelte
  GovernanceBadge.svelte
  ActionList.svelte
```

### **Admin Components**
```
src/lib/components/admin/
  AdminDashboard.svelte
  McpCatalogTable.svelte
  HypermediaInspector.svelte
  EventStreamViewer.svelte
  ProcessGraphAdmin.svelte
  NavlogTimeline.svelte
```

### **Shared Components**
```
src/lib/components/shared/
  TopBar.svelte
  Sidebar.svelte
  Card.svelte
  Badge.svelte
  Table.svelte
  Tabs.svelte
```

---

# **4. Store Architecture**

### **actorStore**
Holds the selected actor.

```ts
export const actorStore = writable({
  actorId: "principal.system",
  authorityTier: 5
});
```

### **processStore**
Holds the current process state from Hub.

```ts
export const processStore = writable({
  entityType: "",
  entityId: "",
  state: "",
  links: [],
  attributes: {}
});
```

### **navigatorStore**
Holds proposals, simulations, decisions.

### **dashboardStore**
Holds aggregated domain state for dashboard cards.

---

# **5. API Client Layer**

```
src/lib/api/
  hub.ts
  process.ts
  mcp.ts
  navlog.ts
  transcript.ts
```

### Example: `process.ts`

```ts
export async function getProcess(entityType, entityId, actorId) {
  const res = await fetch(`/api/hub/process/${entityType}/${entityId}`, {
    headers: {
      "x-api-key": import.meta.env.VITE_API_KEY,
      "x-actor-id": actorId
    }
  });
  return res.json();
}
```

---

# **6. D3 Integration Strategy**

### **Approach**
- Svelte controls DOM
- D3 controls SVG inside a `<g>` element
- No React‑style lifecycle hacks

### **Process Graph**
- Nodes = states
- Edges = transitions
- Highlight:
  - Current state
  - Allowed transitions
  - High‑risk transitions (racing red)

### **Event Timeline**
- X‑axis = time
- Y‑axis = event type
- Hover = event details

### **Navlog Timeline**
- Sequence of:
  - proposals
  - simulations
  - decisions
  - executions

---

# **7. Theming (Your Palette)**

### `src/app.css`

```css
:root {
  --racing-red: #e00000ff;
  --deep-space-blue: #19304dff;
  --white: #ffffffff;
  --black: #000000ff;
}

body {
  background: var(--deep-space-blue);
  color: var(--white);
  font-family: Inter, sans-serif;
}
```

### Tailwind config

```js
theme: {
  extend: {
    colors: {
      racing: "#e00000",
      deep: "#19304d",
      white: "#ffffff",
      black: "#000000"
    }
  }
}
```

---

# **8. Directory Structure**

```
src/
  routes/
  lib/
    api/
    components/
      canvas/
      admin/
      shared/
    stores/
    d3/
  app.css
  app.html
```

---

# **9. Canvas Dashboard Layout**

### **Top Bar**
- Actor selector
- Branding
- Navigation

### **Left Sidebar**
- Entity types
- Navigator sessions
- Admin (if principal.system)

### **Main Dashboard**
- Domain state cards:
  - # of Draft Quotes
  - # of Approved POs
  - # of Pending Journals
  - # of Active Employees
- Process graph (D3)
- Event timeline (D3)
- Navigator proposals
- Governance indicators

---
This architecture is designed to be **scalable, maintainable, and visually stunning** while adhering to the principles of **process‑first, graph‑native design** that you want for ConstitutionalERP.