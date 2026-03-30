import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCanvasEntityLinks, type CanvasEntityLink } from "../api/canvasEntityApi";
import { INITIAL_ACTIONS } from "../api/initialActionsApi";
import { useNavigate } from "react-router-dom";

export default function CanvasRoute() {
  const [entities, setEntities] = useState<CanvasEntityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadEntities() {
    setLoading(true);
    try {
      const links = await getCanvasEntityLinks();
      setEntities(links);
      return links;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntities();
  }, []);

  async function runInitialAction(actionId: string) {
    const action = INITIAL_ACTIONS.find((x) => x.id === actionId);
    if (!action) return;

    setActionBusyId(actionId);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await action.run();
      const refreshed = await loadEntities();

      const createdEntity = refreshed.find(
        (e) =>
          e.entityId === result.entityId &&
          e.processEntityType === result.processEntityType
      );

      if (result.processEntityType && createdEntity?.processReady) {
        setActionMessage(`${result.message}. Opening process view...`);
        navigate(`/canvas/${result.processEntityType}/${encodeURIComponent(result.entityId)}`);
      } else if (result.processEntityType) {
        setActionMessage(
          `${result.message}. Process context is not available yet; stay on Canvas and continue with initial actions.`
        );
      } else {
        setActionMessage(result.message);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Initial action failed");
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Canvas</h1>
      <p className="text-sm text-slate-600">Select an entity to inspect process state, governance links, events, and navigator actions.</p>

      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Initial Actions</h2>
        <p className="mt-1 text-xs text-slate-500">
          Use these to bootstrap records when there is no active process context yet.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {INITIAL_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => runInitialAction(action.id)}
              disabled={actionBusyId === action.id}
              className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-400 disabled:opacity-60"
            >
              <div className="text-sm font-medium">{action.label}</div>
              <div className="mt-1 text-xs text-slate-500">{action.description}</div>
            </button>
          ))}
        </div>
        {actionMessage && <p className="mt-3 text-xs text-green-700">{actionMessage}</p>}
        {actionError && <p className="mt-3 text-xs text-red-700">Error: {actionError}</p>}
      </div>

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
