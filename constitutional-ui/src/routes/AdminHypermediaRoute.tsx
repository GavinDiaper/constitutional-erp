import { useEffect, useState } from "react";
import { getCanvasEntityLinks, type CanvasEntityLink } from "../api/canvasEntityApi";
import { getProcessState, type ProcessLink } from "../api/processApi";

export default function AdminHypermediaRoute() {
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [targets, setTargets] = useState<CanvasEntityLink[]>([]);
  const [links, setLinks] = useState<ProcessLink[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  async function inspect() {
    if (!entityType || !entityId) {
      setError("Please select a valid process entity and id");
      return;
    }
    setError(null);
    try {
      const state = await getProcessState(entityType, entityId);
      setLinks(state.links);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect hypermedia");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hypermedia Inspector</h1>
        <p className="text-sm text-slate-600">Inspect action links returned for an entity state.</p>
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
        <input value={entityType} onChange={(e) => setEntityType(e.target.value)} className="rounded-lg border border-slate-300 p-2 text-sm" />
        <input value={entityId} onChange={(e) => setEntityId(e.target.value)} className="rounded-lg border border-slate-300 p-2 text-sm" />
        <button type="button" onClick={inspect} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Inspect</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {links.map((link) => (
          <div key={link.rel} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="font-mono text-xs">{link.rel}</div>
            <div className="text-xs text-slate-500">{link.method} {link.href}</div>
            {link.governance?.requiredTier && (
              <div className="mt-1 text-xs text-slate-600">Required tier: {link.governance.requiredTier}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
