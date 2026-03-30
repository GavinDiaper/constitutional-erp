import { useEffect, useState } from "react";
import {
  getHarnessRun,
  listHarnessRuns,
  triggerAdminHarness,
  type HarnessRunSummary,
} from "../api/testHarnessApi";

const defaultSuites = [
  "event-replay",
  "cross-erp-equivalence",
  "golden-snapshot",
];

export default function AdminHarnessRoute() {
  const [suiteId, setSuiteId] = useState(defaultSuites[0]);
  const [actorId, setActorId] = useState("principal.system");
  const [runId, setRunId] = useState("");
  const [runs, setRuns] = useState<HarnessRunSummary[]>([]);
  const [runDetail, setRunDetail] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshRuns() {
    const rows = await listHarnessRuns();
    setRuns(rows);
  }

  useEffect(() => {
    refreshRuns().catch(() => setRuns([]));
  }, []);

  async function handleTrigger() {
    setBusy(true);
    setError(null);
    try {
      const created = await triggerAdminHarness(suiteId, actorId || undefined);
      setRunId(created.runId);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start test run");
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadRun() {
    if (!runId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await getHarnessRun(runId.trim());
      setRunDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Test Harness</h1>
        <p className="text-sm text-slate-600">
          Trigger validation suites and inspect run outputs.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Trigger run
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <select
            value={suiteId}
            onChange={(e) => setSuiteId(e.target.value)}
            className="rounded-lg border border-slate-300 p-2 text-sm"
          >
            {defaultSuites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="actorId (optional)"
            className="rounded-lg border border-slate-300 p-2 text-sm"
          />
          <button
            type="button"
            onClick={handleTrigger}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {busy ? "Starting..." : "Run Suite"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Inspect run
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="runId"
            className="min-w-[320px] rounded-lg border border-slate-300 p-2 text-sm font-mono"
          />
          <button
            type="button"
            onClick={handleLoadRun}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? "Loading..." : "Load Run"}
          </button>
        </div>

        {runs.length > 0 && (
          <div className="text-xs text-slate-500">
            Recent runs: {runs.map((r) => r.runId).join(", ")}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {runDetail && (
        <div className="rounded-xl border border-slate-200 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Run details
          </h2>
          <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(runDetail, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
