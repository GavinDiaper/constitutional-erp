import { http } from "./http";

export async function getSessionNavlog(sessionId: string) {
  return http<unknown>(`/api/v1/hub/navlog/${encodeURIComponent(sessionId)}`);
}
