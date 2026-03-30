import type { ProcessLink } from "../../api/processApi";
import { buildProcessGraphModel } from "../../d3/processGraphModel";

interface Props {
  entityType: string;
  currentState: string;
  links: ProcessLink[];
  onSelectAction: (action: string) => void;
}

export default function ProcessGraphPanel({
  entityType,
  currentState,
  links,
  onSelectAction,
}: Props) {
  const graph = buildProcessGraphModel(entityType, currentState, links);

  function visited(state: string) {
    const idx = graph.states.indexOf(state);
    return idx !== -1 && idx <= graph.currentStateIndex;
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-4">
      <h2 className="mb-3 text-lg font-semibold">Process Graph</h2>

      <div className="rounded-lg bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {graph.states.map((state, idx) => (
            <div key={state} className="flex items-center gap-2">
              <div
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  state === graph.currentState
                    ? "bg-blue-600 text-white"
                    : visited(state)
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {state}
              </div>
              {idx < graph.states.length - 1 && <span className="text-slate-400">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Transitions
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {graph.transitions.length === 0 && (
            <p className="text-sm text-slate-500">No transitions defined for this entity.</p>
          )}
          {graph.transitions.map((t) => (
            <button
              key={`${t.from}-${t.action}-${t.to}`}
              type="button"
              disabled={!t.available}
              onClick={() => onSelectAction(t.action)}
              className={`rounded-lg border p-3 text-left text-sm ${
                t.available
                  ? "border-slate-300 bg-white hover:border-slate-500"
                  : "border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <div className="font-mono text-xs">{t.action}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t.from} → {t.to}
              </div>
              <div className="mt-1 text-[11px]">
                {t.available ? "Available now" : "Not available in current state"}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
