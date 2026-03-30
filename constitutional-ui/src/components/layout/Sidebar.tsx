import { NavLink, useLocation } from "react-router-dom";

const canvasEntities = [
  "customers",
  "quotes",
  "orders",
  "invoices",
  "payments",
  "suppliers",
  "requisitions",
  "purchase-orders",
  "journals",
  "employees"
];

const adminLinks = [
  { to: "/admin/entities", label: "Entity Explorer" },
  { to: "/admin/events", label: "Event Explorer" },
  { to: "/admin/process-graphs", label: "Process Graphs" },
  { to: "/admin/hypermedia", label: "Hypermedia Inspector" },
  { to: "/admin/mcp-catalog", label: "MCP Catalog" },
  { to: "/admin/nav-sessions", label: "Navigator Sessions" },
  { to: "/admin/test-harness", label: "Test Harness" }
];

export default function Sidebar() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <aside className="hidden w-72 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {isAdmin ? "Admin" : "Canvas"}
      </h2>
      <div className="space-y-1">
        {isAdmin
          ? adminLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className="sidebar-link">
                {link.label}
              </NavLink>
            ))
          : canvasEntities.map((entity) => (
              <NavLink key={entity} to={`/canvas/${entity}/sample-${entity}`} className="sidebar-link">
                {entity}
              </NavLink>
            ))}
      </div>
    </aside>
  );
}
