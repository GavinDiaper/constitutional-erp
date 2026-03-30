import { useState } from "react";
import { getProcessState, type ProcessLink } from "../api/processApi";

export default function AdminHypermediaRoute() {
  const [entityType, setEntityType] = useState("quotes");
  const [entityId, setEntityId] = useState("sample-quotes");
  const [links, setLinks] = useState<ProcessLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function inspect() {
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
