import { HttpError } from "../utils/errors";

function parseBody(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = parseBody(text);
  const data = parsed as T;

  if (!response.ok) {
    const detail =
      typeof (parsed as { detail?: unknown })?.detail === "string"
        ? ((parsed as { detail: string }).detail)
        : (text || response.statusText || "Upstream request failed");

    throw new HttpError(response.status, "upstream_error", `Upstream request failed: ${url} (${detail})`);
  }

  return { status: response.status, data };
}

export async function requestJsonAllowError<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = parseBody(text) as T;
  return { status: response.status, data };
}
