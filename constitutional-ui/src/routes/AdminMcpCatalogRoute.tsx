import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMcpFunctions, type McpFunction } from "../api/mcpApi";
import { getProcessState } from "../api/processApi";
import { getInitialActionById } from "../api/initialActionsApi";
import {
  getCanvasEntityLinks,
  type CanvasEntityLink,
} from "../api/canvasEntityApi";

const STARTER_ACTIONS: Record<string, string> = {
  create_supplier: "create-supplier",
  create_requisition: "create-requisition",
  create_employee: "create-employee",
  create_quote: "create-quote",
  create_manual_journal: "create-journal",
};

export default function AdminMcpCatalogRoute() {
  const [rows, setRows] = useState<McpFunction[]>([]);
  const [entityLinks, setEntityLinks] = useState<CanvasEntityLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMcpFunctions()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load MCP catalog"));

    getCanvasEntityLinks()
      .then(setEntityLinks)
      .catch(() => setEntityLinks([]));
  }, []);

  function toProcessEntityType(entity: string): string {
    const normalized = entity.trim().toLowerCase().replace(/\s+/g, "-");
    if (normalized === "sales-order") return "sales-order";
    if (normalized === "purchase-order") return "purchase-order";
    if (normalized === "invoice" || normalized === "ar-invoice") return "ar-invoice";
    if (normalized === "payment" || normalized === "ar-payment") return "ar-payment";
    return normalized;
  }

  function openLiveEntity(fn: McpFunction) {
    setError(null);
    setMessage(null);

    const processEntityType = toProcessEntityType(fn.entity);
    const candidate = entityLinks.find(
      (x) =>
        x.processEntityType === processEntityType &&
        x.entityId &&
        x.processReady
    );

    if (!candidate?.entityId) {
      setMessage(`No live process-ready '${processEntityType}' entity available to open.`);
      return;
    }

    navigate(
      `/canvas/${processEntityType}/${encodeURIComponent(candidate.entityId)}`
    );
  }

  async function runAction(fn: McpFunction) {
    setError(null);
    setMessage(null);

    const starterId = STARTER_ACTIONS[fn.action];
    const starter = starterId ? getInitialActionById(starterId) : undefined;

    if (!starter) {
      setMessage(`Action '${fn.action}' is clickable, but starter flow is not wired yet.`);
      return;
    }

    setBusyId(fn.id);
    try {
      const result = await starter.run();
      setMessage(result.message);

      if (result.processEntityType) {
        try {
          await getProcessState(result.processEntityType, result.entityId);
          navigate(`/canvas/${result.processEntityType}/${encodeURIComponent(result.entityId)}`);
          return;
        } catch {
          setMessage(`${result.message}. Process context not active yet.`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run starter action");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">MCP Catalog</h1>
        <p className="text-sm text-slate-600">Semantic actions and governance requirements from Integration Hub.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-slate-600">{message}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Required Tier</th>
              <th className="px-3 py-2">Tag</th>
              <th className="px-3 py-2">Start</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((fn) => (
              <tr key={fn.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{fn.entity}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => openLiveEntity(fn)}
                    className="rounded px-1 py-0.5 hover:bg-slate-100"
                  >
                    {fn.action}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs">{fn.riskLevel ?? "-"}</td>
                <td className="px-3 py-2 text-xs">{fn.requiredTier ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fn.governanceTag ?? "-"}</td>
                <td className="px-3 py-2 text-xs">
                  {STARTER_ACTIONS[fn.action] ? (
                  <button
                    type="button"
                    onClick={() => runAction(fn)}
                    disabled={busyId === fn.id}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-slate-500 disabled:opacity-50"
                  >
                    {busyId === fn.id ? "Starting..." : "Start"}
                  </button>
                  ) : (
                    <span className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-400">
                      Not startable
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
