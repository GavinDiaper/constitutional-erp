import { http } from "./http";

export async function triggerAdminHarness(name: string, payload?: unknown) {
  return http<{ runId: string }>("/api/admin/test-harness/trigger", {
    method: "POST",
    body: JSON.stringify({ name, payload }),
  });
}

export async function getHarnessRun(runId: string) {
  return http<unknown>(`/api/admin/test-harness/runs/${encodeURIComponent(runId)}`);
}
