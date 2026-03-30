import { useEffect, useState } from "react";
import { getCanvasEntityLinks, type CanvasEntityLink } from "../api/canvasEntityApi";
import { getProcessState, type ProcessState } from "../api/processApi";
import ProcessGraphPanel from "../components/canvas/ProcessGraphPanel";

export default function AdminProcessGraphsRoute() {
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [targets, setTargets] = useState<CanvasEntityLink[]>([]);
  const [result, setResult] = useState<ProcessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCanvasEntityLinks()
      .then((rows) => rows.filter((r) => r.processEntityType && r.entityId))
      .then((rows) => {
        setTargets(rows);
        const firstReady = rows.find((r) => r.processReady);
        const first = firstReady ?? rows[0];
        if (first?.processEntityType && first.entityId) {
          setEntityType(first.processEntityType);
          setEntityId(first.entityId);
        }
      })
      .catch(() => setTargets([]));
  }, []);

  async function handleLoad() {
    if (!entityType || !entityId) {
      setError("Please select a valid process entity and id");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await getProcessState(entityType, entityId);
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load process state");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Process Graphs</h1>
        <p className="text-sm text-slate-600">Inspect process state and available transitions for any entity.</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3">
        <select
          value={entityType && entityId ? `${entityType}|${entityId}` : ""}
          onChange={(e) => {
            const [nextType, nextId] = e.target.value.split("|");
            setEntityType(nextType ?? "");
            setEntityId(nextId ?? "");
          }}
          className="rounded-lg border border-slate-300 p-2 text-sm md:col-span-3"
        >
          <option value="">Select live process entity</option>
          {targets.map((t) => (
            <option
              key={`${t.entityType}-${t.entityId}`}
              value={`${t.processEntityType}|${t.entityId}`}
            >
              {t.label} / {t.entityId} {t.processReady ? "" : "(may be unavailable)"}
            </option>
          ))}
        </select>
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-lg border border-slate-300 p-2 text-sm"
          placeholder="process entityType (e.g. quote)"
        />
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className="rounded-lg border border-slate-300 p-2 text-sm"
          placeholder="entityId"
        />
        <button
          type="button"
          onClick={handleLoad}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Loading..." : "Load"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="text-sm">
            State: <span className="font-medium">{result.state}</span>
          </div>
          <ProcessGraphPanel
            entityType={entityType}
            currentState={result.state}
            links={result.links}
            onSelectAction={() => {
              // Admin graph supports click affordance, execution stays in Canvas Navigator.
            }}
          />
        </div>
      )}
    </div>
  );
}
