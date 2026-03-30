import { useEffect, useState } from "react";
import { getEntityEvents, type EntityEvent } from "../../api/eventsApi";

const riskColors: Record<string, string> = {
  Low: "bg-green-100 text-green-700",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-red-100 text-red-700",
};

interface Props {
  entityType: string;
  entityId: string;
}

export default function EventTimeline({ entityType, entityId }: Props) {
  const [events, setEvents] = useState<EntityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEntityEvents(entityType, entityId)
      .then(setEvents)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading events…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">Error loading events: {error}</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No events recorded for <span className="font-mono">{entityId}</span>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
        Event history ({events.length})
      </h2>

      <ol className="relative border-l border-slate-200 pl-5 space-y-5">
        {events.map((ev) => {
          const governance = ev.governance_json
            ? (JSON.parse(ev.governance_json) as Record<string, unknown>)
            : null;
          const riskLevel = governance?.riskLevel as string | undefined;

          const actor = ev.actor
            ? (JSON.parse(ev.actor) as Record<string, unknown>)
            : null;

          return (
            <li key={ev.event_id} className="relative">
              <span className="absolute -left-[1.375rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400" />

              <div className="flex flex-wrap items-center gap-2">
                <time className="text-xs text-slate-400 tabular-nums">
                  {new Date(ev.timestamp).toLocaleString()}
                </time>
                <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-mono text-white">
                  {ev.event_type}
                </span>
                {riskLevel && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      riskColors[riskLevel] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {riskLevel}
                  </span>
                )}
                <span className="text-xs text-slate-400">v{ev.version}</span>
              </div>

              {actor && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Actor:{" "}
                  <span className="font-mono text-slate-600">
                    {String(actor.id ?? actor.type ?? "unknown")}
                  </span>
                </p>
              )}

              {ev.correlation_id && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Correlation:{" "}
                  <span className="font-mono text-slate-500">{ev.correlation_id}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
