import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getCanvasEntityLinks, type CanvasEntityLink } from "../../api/canvasEntityApi";

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
  const [canvasEntities, setCanvasEntities] = useState<CanvasEntityLink[]>([]);

  useEffect(() => {
    if (isAdmin) return;
    getCanvasEntityLinks().then(setCanvasEntities).catch(() => setCanvasEntities([]));
  }, [isAdmin]);

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
              entity.entityId && entity.processEntityType && entity.processReady ? (
                <NavLink
                  key={entity.entityType}
                  to={`/canvas/${entity.processEntityType}/${encodeURIComponent(entity.entityId)}`}
                  className="sidebar-link"
                >
                  {entity.entityType}
                </NavLink>
              ) : (
                <span key={entity.entityType} className="sidebar-link opacity-50">
                  {entity.entityType}
                </span>
              )
            ))}
      </div>
    </aside>
  );
}
