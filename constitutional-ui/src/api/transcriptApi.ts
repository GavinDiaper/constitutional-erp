import { http } from "./http";

export async function getSessionTranscript(sessionId: string) {
  return http<unknown>(`/api/v1/hub/transcript/${encodeURIComponent(sessionId)}`);
}
