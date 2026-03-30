const stateColors: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Active: "bg-blue-100 text-blue-700",
  Accepted: "bg-green-100 text-green-700",
  Completed: "bg-green-100 text-green-700",
  Posted: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
  Rejected: "bg-red-100 text-red-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Approved: "bg-blue-100 text-blue-700",
  Paid: "bg-green-100 text-green-700",
  Settled: "bg-green-100 text-green-700",
};

interface Props {
  entityType: string;
  entityId: string;
  state?: string;
  loading?: boolean;
}

export default function EntityHeader({ entityType, entityId, state, loading }: Props) {
  const badgeClass = state ? (stateColors[state] ?? "bg-slate-100 text-slate-700") : "";

  return (
    <div className="rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold capitalize">
          {entityType.replace(/-/g, " ")}{" "}
          <span className="text-slate-400">/</span>{" "}
          <span className="font-mono text-xl">{entityId}</span>
        </h1>
        <p className="mt-0.5 text-xs text-slate-400 uppercase tracking-wide">
          {entityType}
        </p>
      </div>

      <div className="shrink-0 mt-1">
        {loading ? (
          <span className="text-xs text-slate-400">Loading…</span>
        ) : state ? (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}>
            {state}
          </span>
        ) : null}
      </div>
    </div>
  );
}
