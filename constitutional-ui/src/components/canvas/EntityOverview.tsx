import type { ProcessState } from "../../api/processApi";

const riskColors: Record<string, string> = {
  Low: "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-red-100 text-red-700",
};

interface Props {
  processState: ProcessState | null;
  loading: boolean;
  error: string | null;
}

export default function EntityOverview({ processState, loading, error }: Props) {
  if (loading) {
    return <p className="text-sm text-slate-400">Loading entity…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">Error: {error}</p>;
  }

  if (!processState) {
    return <p className="text-sm text-slate-400">No data.</p>;
  }

  const attrs = Object.entries(processState.attributes);

  return (
    <div className="space-y-6">
      {/* Fields */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Fields
        </h2>
        {attrs.length === 0 ? (
          <p className="text-sm text-slate-400">No attributes returned.</p>
        ) : (
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {attrs.map(([key, val]) => (
              <div key={key} className="flex flex-col">
                <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  {key.replace(/_/g, " ")}
                </dt>
                <dd className="mt-0.5 text-sm text-slate-800 break-words">
                  {val === null || val === undefined ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    String(val)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Available actions */}
      {processState.links.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Available actions
          </h2>
          <div className="flex flex-wrap gap-2">
            {processState.links.map((link) => (
              <span
                key={link.rel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
              >
                {link.rel}
                {link.governance?.riskLevel && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      riskColors[link.governance.riskLevel] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {link.governance.riskLevel}
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
