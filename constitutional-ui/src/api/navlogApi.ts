import { http } from "./http";

export interface NavSession {
  sessionId: string;
  actorId: string;
  mode: "offline" | "online";
  context?: Record<string, unknown>;
  createdAt: string;
  endedAt?: string;
  status: "open" | "closed";
}

export interface NavlogEnvelope<T> {
  data: T[];
}

export async function createSession(actorId: string, mode: "offline" | "online" = "online") {
  return http<{ sessionId: string }>("/api/v1/hub/sessions", {
    method: "POST",
    body: JSON.stringify({ actorId, mode }),
  });
}

export async function getSession(sessionId: string): Promise<NavSession> {
  return http<NavSession>(`/api/v1/hub/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getSessionNavlog(sessionId: string) {
  return http<NavlogEnvelope<Record<string, unknown>>>(
    `/api/v1/hub/sessions/${encodeURIComponent(sessionId)}/navlog`
  );
}

export async function getSessionTranscript(sessionId: string) {
  return http<NavlogEnvelope<Record<string, unknown>>>(
    `/api/v1/hub/sessions/${encodeURIComponent(sessionId)}/transcript`
  );
}
