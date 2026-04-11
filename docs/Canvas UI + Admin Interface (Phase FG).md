Combined specification – Canvas UI + Admin Interface (Phase F/G)
________________________________________
1. Scope and goals
Goal: Deliver a single web application that:
•	Provides a login that binds a user to a FoundationERP actor.
•	Exposes a Canvas UI for process first, Navigator driven work.
•	Exposes an Admin Interface only when actorId === "principal.system".
•	Uses React + Vite (with a Next style routing structure).
•	Integrates D3 for process graphs and timelines.
•	Talks only to Integration Hub v2 and FoundationERP APIs.
________________________________________
2. High level architecture
2.1 Frontend architecture
•	Tech stack:
o	React (functional components, hooks)
o	Vite (bundler/dev server)
o	TypeScript
o	React Router (for routing)
o	D3.js (visualisations)
o	Tailwind or CSS Modules (styling, optional)
•	Top level concerns:
o	Auth & actor context
o	Canvas views (entities, Navigator, timelines)
o	Admin views (explorers, visualisers)
o	Shared layout & navigation
o	API client layer
2.2 Backend dependencies
•	FoundationERP 
o	/internal/actors/by-username/:username (actor lookup)
•	Integration Hub v2 
o	/process/:entityType/:entityId
o	/mcp/functions
o	/hub/sessions
o	/hub/sessions/:sessionId/navlog
o	/hub/sessions/:sessionId/transcript
o	/hub/governance-decisions
•	Event store / CEP 
o	/events/entity/:type/:id (or equivalent)
________________________________________
3. Wireframes (text sketches)
3.1 Login page
+--------------------------------------------------+
| [Logo]                                           |
|                                                  |
|  ConstitutionalERP                               |
|  Sign in                                         |
|                                                  |
|  [ Username           ]                          |
|  [ Password           ]                          |
|                                                  |
|  [  Login  ]                                     |
|                                                  |
|  (Footer: "Powered by FoundationERP")            |
+--------------------------------------------------+
3.2 Home page (after login)
+--------------------------------------------------+
| [Logo]  ConstitutionalERP                        |
| [Home] [Canvas] [Navigator Sessions] [Admin*]    |
| [User: actor-123] [Logout]                       |
+--------------------------------------------------+
| Hero:                                            |
|  "Enterprise that governs itself"                |
|  Short pitch text                                |
|                                                  |
|  [Go to Canvas]                                  |
+--------------------------------------------------+
* Admin visible only if actorId === "principal.system"
3.3 Canvas – Entity view
+--------------------------------------------------------------------------------+
| Header: [Logo] [Home] [Canvas] [Navigator Sessions] [Admin*] [User] [Logout]   |
+--------------------------------------------------------------------------------+
| Sidebar (Entities)              | Main Canvas                                  |
|---------------------------------|----------------------------------------------|
| - Customers                     | [Entity Header]                              |
| - Quotes                        |  Quote Q-123  (State: Accepted)             |
| - Orders                        |                                              |
| - Invoices                      | [Tabs]                                       |
| - Payments                      |  - Overview                                  |
| - Suppliers                     |  - Process Graph                             |
| - Requisitions                  |  - Events                                    |
| - Purchase Orders               |  - Navigator                                 |
| - Journals                      |                                              |
| - Employees                     | [Overview Tab]                               |
|                                 |  - Key fields                                |
|                                 |  - Related entities                          |
|                                 |                                              |
|                                 | [Process Graph Tab - D3]                     |
|                                 |  - State nodes, transitions                  |
|                                 |  - Current state highlighted                 |
|                                 |                                              |
|                                 | [Navigator Tab]                              |
|                                 |  - Proposed actions                          |
|                                 |  - Risk & required tier                      |
|                                 |  - Simulation results                        |
|                                 |  - Execute button (if allowed)              |
+--------------------------------------------------------------------------------+
3.4 Admin – Overview
+--------------------------------------------------------------------------------+
| Header: [Logo] [Home] [Canvas] [Navigator Sessions] [Admin] [User] [Logout]    |
+--------------------------------------------------------------------------------+
| Sidebar (Admin)                 | Main Admin Panel                             |
|---------------------------------|----------------------------------------------|
| - Entity Explorer               | [Admin Dashboard]                            |
| - Event Explorer                |  - System health                             |
| - Process Graphs                |  - Recent navlog sessions                    |
| - Hypermedia Inspector          |  - Recent governance decisions               |
| - MCP Catalog                   |                                              |
| - Navigator Sessions            |                                              |
| - Test Harness                  |                                              |
+--------------------------------------------------------------------------------+
________________________________________
4. Folder structure (Vite + React + TS)
constitutional-ui/
  index.html
  vite.config.ts
  package.json
  tsconfig.json

  /src
    main.tsx
    App.tsx

    /routes
      LoginRoute.tsx
      HomeRoute.tsx
      CanvasRoute.tsx
      EntityRoute.tsx        // /canvas/:entityType/:entityId
      NavigatorSessionsRoute.tsx
      AdminRoute.tsx
      AdminEntityExplorerRoute.tsx
      AdminEventExplorerRoute.tsx
      AdminProcessGraphsRoute.tsx
      AdminHypermediaRoute.tsx
      AdminMcpCatalogRoute.tsx
      AdminNavSessionsRoute.tsx
      AdminTestHarnessRoute.tsx

    /components
      layout/
        AppLayout.tsx
        Header.tsx
        Sidebar.tsx
      auth/
        LoginForm.tsx
      canvas/
        EntityHeader.tsx
        EntityOverview.tsx
        NavigatorPanel.tsx
        SimulationPanel.tsx
        EventTimeline.tsx
        ProcessGraph.tsx      // D3 wrapper
      admin/
        AdminDashboard.tsx
        EntityTable.tsx
        EventStreamView.tsx
        ProcessGraphAdmin.tsx // D3 wrapper
        HypermediaView.tsx
        McpCatalogTable.tsx
        NavlogTimeline.tsx    // D3 wrapper
        TestRunList.tsx
        TestRunDetail.tsx

    /context
      AuthContext.tsx
      ActorContext.tsx

    /api
      authApi.ts
      actorApi.ts
      processApi.ts
      mcpApi.ts
      navlogApi.ts
      transcriptApi.ts
      eventsApi.ts
      testHarnessApi.ts

    /d3
      processGraphRenderer.ts
      eventTimelineRenderer.ts
      navlogTimelineRenderer.ts

    /styles
      globals.css
      components.css
________________________________________
5. React/Router component architecture (with Vite)
5.1 App entry
// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
// App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ActorProvider } from "./context/ActorContext";
import AppLayout from "./components/layout/AppLayout";
import LoginRoute from "./routes/LoginRoute";
import HomeRoute from "./routes/HomeRoute";
import CanvasRoute from "./routes/CanvasRoute";
import EntityRoute from "./routes/EntityRoute";
import NavigatorSessionsRoute from "./routes/NavigatorSessionsRoute";
import AdminRoute from "./routes/AdminRoute";

export default function App() {
  return (
    <AuthProvider>
      <ActorProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/canvas" element={<CanvasRoute />} />
            <Route path="/canvas/:entityType/:entityId" element={<EntityRoute />} />
            <Route path="/navigator-sessions" element={<NavigatorSessionsRoute />} />
            <Route path="/admin/*" element={<AdminRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ActorProvider>
    </AuthProvider>
  );
}
5.2 Auth & actor context
•	AuthContext 
o	Holds isAuthenticated, token, login(), logout().
•	ActorContext 
o	Holds actorId, actorName, authorityTier, domains[].
o	Populated after login via actorApi.getActorByUsername().
5.3 Admin route guard
// AdminRoute.tsx
import { useActor } from "../context/ActorContext";
import { Navigate, Routes, Route } from "react-router-dom";
import AdminDashboard from "../components/admin/AdminDashboard";
// ...other admin routes

export default function AdminRoute() {
  const { actorId } = useActor();

  if (actorId !== "principal.system") {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      {/* other nested admin routes */}
    </Routes>
  );
}
________________________________________
6. D3 integration plan
6.1 Approach
•	Use D3 in “headless” mode: 
o	React owns the DOM.
o	D3 manipulates only within a given <svg> or <g> element.
•	Each visualisation gets: 
o	A dedicated React component.
o	A D3 renderer module in /src/d3.
6.2 Process graph visualisation
Data source:
•	processApi.getProcess(entityType, entityId) → returns: 
o	state
o	graph (optional, from PGE)
o	links[] (hypermedia with governance)
Renderer:
•	processGraphRenderer.ts: 
o	Accepts: 
	nodes (states)
	edges (transitions)
	currentState
	governedLinks (to highlight allowed transitions)
o	Uses: 
	D3 force or DAG layout
	Color coding: 
	Current state
	Allowed transitions
	High risk transitions
React wrapper:
// ProcessGraph.tsx
import { useEffect, useRef } from "react";
import { renderProcessGraph } from "../../d3/processGraphRenderer";

export default function ProcessGraph({ graph, currentState, links }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      renderProcessGraph(ref.current, graph, currentState, links);
    }
  }, [graph, currentState, links]);

  return <svg ref={ref} width="100%" height="300" />;
}
6.3 Event timeline
Data source:
•	eventsApi.getEvents(entityType, entityId) → list of events with timestamps.
Renderer:
•	eventTimelineRenderer.ts: 
o	X axis: time
o	Y axis: event type or single lane
o	Hover: event details
React wrapper:
// EventTimeline.tsx
import { useEffect, useRef } from "react";
import { renderEventTimeline } from "../../d3/eventTimelineRenderer";

export default function EventTimeline({ events }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      renderEventTimeline(ref.current, events);
    }
  }, [events]);

  return <svg ref={ref} width="100%" height="200" />;
}
6.4 Navlog timeline (Admin)
Data source:
•	navlogApi.getNavlog(sessionId) → proposals, simulations, decisions, executions.
Renderer:
•	navlogTimelineRenderer.ts: 
o	Time based sequence of navlog entries.
o	Different shapes/colors for: 
	proposal
	simulation
	decision
	execution
o	Click → show details.
________________________________________
7. ConstitutionalERP + FoundationERP home page copy
You can drop this into the home page hero section:
ConstitutionalERP — Enterprise that governs itself
ConstitutionalERP combines FoundationERP, a canonical, ERP agnostic model of your core operations,
with a constitutional AI layer that navigates processes, respects governance, and executes with
mathematical clarity.
Every action is governed. Every event is replayable. Every process is a graph that AI can reason over.
This is enterprise without silos.
This is governance without friction.
This is execution without ambiguity.

