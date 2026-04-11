import { HttpError } from "../utils/errors";

export async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : raw;
    throw new HttpError(response.status, "upstream_request_failed", detail || `Upstream request failed: ${url}`);
  }

  return body as T;
}

export async function requestJsonAllowError<T>(url: string, init: RequestInit): Promise<{ status: number; data: T | null }> {
  const response = await fetch(url, init);
  const raw = await response.text();
  const body = raw ? (JSON.parse(raw) as T) : null;

  return {
    status: response.status,
    data: body
  };
}
