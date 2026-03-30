import { useEffect, useState } from "react";
import { getMcpFunctions, type McpFunction } from "../api/mcpApi";

export default function AdminMcpCatalogRoute() {
  const [rows, setRows] = useState<McpFunction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMcpFunctions()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load MCP catalog"));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">MCP Catalog</h1>
        <p className="text-sm text-slate-600">Semantic actions and governance requirements from Integration Hub.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Required Tier</th>
              <th className="px-3 py-2">Tag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((fn) => (
              <tr key={fn.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{fn.entity}</td>
                <td className="px-3 py-2 font-mono text-xs">{fn.action}</td>
                <td className="px-3 py-2 text-xs">{fn.riskLevel ?? "-"}</td>
                <td className="px-3 py-2 text-xs">{fn.requiredTier ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fn.governanceTag ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
