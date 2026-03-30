const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("canvas_token");
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  const body = text ? safeParse(text) : null;

  if (!response.ok) {
    const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : response.statusText;
    throw new Error(message || `HTTP ${response.status}`);
  }

  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
