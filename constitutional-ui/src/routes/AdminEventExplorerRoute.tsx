import { useEffect, useMemo, useState } from "react";
import { getEvents, type EntityEvent } from "../api/eventsApi";

export default function AdminEventExplorerRoute() {
  const [events, setEvents] = useState<EntityEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEvents(300)
      .then((rows) => setEvents(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load events"));
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.event_type.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        e.entity_id.toLowerCase().includes(q)
    );
  }, [events, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Event Explorer</h1>
        <p className="text-sm text-slate-600">Recent domain events from FoundationERP event store.</p>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by event type, entity type, or id"
        className="w-full rounded-lg border border-slate-300 p-2 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Entity ID</th>
              <th className="px-3 py-2">Version</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev) => (
              <tr key={ev.event_id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-xs text-slate-500">{new Date(ev.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-xs">{ev.event_type}</td>
                <td className="px-3 py-2 text-xs">{ev.entity_type}</td>
                <td className="px-3 py-2 font-mono text-xs">{ev.entity_id}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{ev.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
