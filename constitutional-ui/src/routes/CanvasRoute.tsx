import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCanvasEntityLinks, type CanvasEntityLink } from "../api/canvasEntityApi";

export default function CanvasRoute() {
  const [entities, setEntities] = useState<CanvasEntityLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCanvasEntityLinks()
      .then(setEntities)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Canvas</h1>
      <p className="text-sm text-slate-600">Select an entity to inspect process state, governance links, events, and navigator actions.</p>
      {loading && <p className="text-sm text-slate-400">Resolving live entity IDs...</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((entity) => (
          entity.entityId && entity.processEntityType && entity.processReady ? (
            <Link
              key={entity.entityType}
              to={`/canvas/${entity.processEntityType}/${encodeURIComponent(entity.entityId)}`}
              className="rounded-xl border border-slate-200 p-4 hover:border-slate-400"
            >
              <div className="text-sm font-medium">{entity.label}</div>
              <div className="mt-1 text-xs text-slate-500 font-mono">{entity.entityId}</div>
            </Link>
          ) : (
            <div key={entity.entityType} className="rounded-xl border border-dashed border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-500">{entity.label}</div>
              <div className="text-xs text-slate-400">
                {entity.entityId ? "No active process context" : "No records available"}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
