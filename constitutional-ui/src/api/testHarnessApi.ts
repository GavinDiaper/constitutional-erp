import { http } from "./http";

export interface HarnessRunSummary {
  runId: string;
  status?: string;
  createdAt?: string;
}

export async function triggerAdminHarness(
  suiteId: string,
  actorId?: string
) {
  try {
    return await http<{ runId: string }>("/api/tests/run", {
      method: "POST",
      body: JSON.stringify({ suiteId, actorId }),
    });
  } catch {
    return http<{ runId: string }>("/api/admin/test-harness/trigger", {
      method: "POST",
      body: JSON.stringify({ name: suiteId, payload: actorId ? { actorId } : undefined }),
    });
  }
}

export async function listHarnessRuns(): Promise<HarnessRunSummary[]> {
  try {
    return await http<HarnessRunSummary[]>("/api/tests/runs");
  } catch {
    return [];
  }
}

export async function getHarnessRun(runId: string) {
  try {
    return await http<unknown>(`/api/tests/runs/${encodeURIComponent(runId)}`);
  } catch {
    return http<unknown>(
      `/api/admin/test-harness/runs/${encodeURIComponent(runId)}`
    );
  }
}
