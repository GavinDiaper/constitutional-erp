import { useEffect, useMemo, useState } from "react";
import {
  executeProcessAction,
  type ExecuteProcessActionResult,
  type InputSchema,
  type ProcessLink,
} from "../../api/processApi";
import { getActionCandidates } from "../../d3/processGraphModel";

interface Props {
  entityType: string;
  entityId: string;
  links: ProcessLink[];
  onExecuted: () => Promise<void>;
  preselectedAction?: string | null;
}

export default function NavigatorPanel({
  entityType,
  entityId,
  links,
  onExecuted,
  preselectedAction,
}: Props) {
  const [selectedAction, setSelectedAction] = useState<string>(links[0]?.rel ?? "");
  const [result, setResult] = useState<ExecuteProcessActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedLink = useMemo(
    () => links.find((x) => x.rel === selectedAction),
    [links, selectedAction]
  );
  const autoPayload = useMemo(
    () => buildDefaultPayload(selectedLink?.requiredInput),
    [selectedLink]
  );

  useEffect(() => {
    if (!preselectedAction) return;
    if (!links.some((l) => l.rel === preselectedAction)) return;
    setSelectedAction(preselectedAction);
  }, [preselectedAction, links]);

  async function handleExecute() {
    if (!selectedAction) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const payload = autoPayload;
      const candidates = getActionCandidates(selectedAction);
      let res: ExecuteProcessActionResult | null = null;
      let lastError: unknown = null;

      for (const candidate of candidates) {
        try {
          res = await executeProcessAction(entityType, entityId, candidate, payload);
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!res) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Execution failed");
      }

      setResult(res);
      await onExecuted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setBusy(false);
    }
  }

  if (links.length === 0) {
    return <p className="text-sm text-slate-500">No navigator actions available for this state.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Proposed Actions
        </h2>
        <p className="text-xs text-slate-500">Select an action and execute with auto-filled payload.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {links.map((link) => (
            <button
              key={link.rel}
              type="button"
              onClick={() => setSelectedAction(link.rel)}
              className={`w-full rounded-lg border p-3 text-left ${
                selectedAction === link.rel
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{link.rel}</span>
                {link.governance?.riskLevel && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      selectedAction === link.rel
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {link.governance.riskLevel}
                  </span>
                )}
              </div>
              {link.governance?.requiredTier && (
                <div className="mt-1 text-xs opacity-80">
                  Required Tier {link.governance.requiredTier}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Selected action</div>
            <div className="mt-1 font-mono text-sm">{selectedAction || "None"}</div>
            {selectedLink?.requiredInput && (
              <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                {JSON.stringify(selectedLink.requiredInput, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Auto payload</div>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
              {JSON.stringify(autoPayload, null, 2)}
            </pre>
          </div>

          <button
            type="button"
            onClick={handleExecute}
            disabled={busy || !selectedAction}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Executing..." : "Execute"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {result && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              Executed <span className="font-mono">{result.action}</span>: {result.previousState} -&gt; {result.newState}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildDefaultPayload(schema?: InputSchema): Record<string, unknown> {
  if (!schema || schema.type !== "object") {
    return {};
  }

  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  const payload: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(properties)) {
    if (!required.has(key)) {
      continue;
    }
    payload[key] = defaultValueForProperty(prop);
  }

  return payload;
}

function defaultValueForProperty(prop: unknown): unknown {
  if (!prop || typeof prop !== "object") {
    return "";
  }

  const typed = prop as { type?: unknown; items?: unknown };
  const type = typeof typed.type === "string" ? typed.type : "";

  if (type === "string") return "";
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};

  if (Array.isArray(typed.items)) {
    return [];
  }

  return "";
}
