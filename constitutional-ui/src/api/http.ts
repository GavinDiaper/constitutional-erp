const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("canvas_token");
  const actorId = token ? actorIdFromToken(token) : undefined;
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(actorId ? { "x-actor-id": actorId } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  const body = text ? safeParse(text) : null;

  if (!response.ok) {
    const message = extractErrorMessage(body) ?? response.statusText;
    throw new Error(message || `HTTP ${response.status}`);
  }

  return body as T;
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const typed = body as Record<string, unknown>;
  if (typeof typed.error === "string" && typed.error.length > 0) {
    return typed.error;
  }
  if (typeof typed.detail === "string" && typed.detail.length > 0) {
    return typed.detail;
  }
  if (typeof typed.title === "string" && typed.title.length > 0) {
    return typed.title;
  }

  return null;
}

function actorIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token)) as { actorId?: unknown };
    return typeof payload.actorId === "string" && payload.actorId.length > 0
      ? payload.actorId
      : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(normalized + padding);
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
