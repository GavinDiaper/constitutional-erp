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
  const data = parseBody(text) as T;

  if (!response.ok) {
    throw new HttpError(response.status, "upstream_error", `Upstream request failed: ${url}`);
  }

  return { status: response.status, data };
}

export async function requestJsonAllowError<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = parseBody(text) as T;
  return { status: response.status, data };
}
