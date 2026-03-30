import { useEffect, useMemo, useState } from "react";
import { listQueryTables, listTableRows, type QueryTableInfo } from "../api/queryApi";

export default function AdminEntityExplorerRoute() {
  const [tables, setTables] = useState<QueryTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listQueryTables()
      .then((data) => {
        setTables(data);
        if (data.length > 0) {
          setSelectedTable(data[0].name);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tables"));
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    listTableRows(selectedTable, 50, 0)
      .then((result) => setRows(result.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load rows"));
  }, [selectedTable]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    return Array.from(keys).slice(0, 12);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Entity Explorer</h1>
        <p className="text-sm text-slate-600">Browse whitelisted FoundationERP tables via Query API.</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <label htmlFor="table-select" className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Table
        </label>
        <select
          id="table-select"
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
        >
          {tables.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.primaryKey})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-100 align-top">
                {columns.map((c) => (
                  <td key={c} className="max-w-[260px] px-3 py-2 text-xs text-slate-700">
                    <span className="block truncate" title={String(row[c] ?? "")}>{String(row[c] ?? "")}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
