import { HttpError } from "../utils/errors";
import { sanitizeHeaders, serializeBody } from "../utils/logging";

export async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const method = init.method ?? "GET";
  console.info("[integration-hub][upstream][request]", {
    method,
    url,
    headers: sanitizeHeaders(init.headers),
    body: serializeBody(init.body)
  });

  const response = await fetch(url, init);
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;

  console.info("[integration-hub][upstream][response]", {
    method,
    url,
    status: response.status,
    body: serializeBody(raw)
  });

  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : raw;
    throw new HttpError(response.status, "upstream_request_failed", detail || `Upstream request failed: ${url}`);
  }

  return body as T;
}

export async function requestJsonAllowError<T>(url: string, init: RequestInit): Promise<{ status: number; data: T | null }> {
  const method = init.method ?? "GET";
  console.info("[integration-hub][upstream][request]", {
    method,
    url,
    headers: sanitizeHeaders(init.headers),
    body: serializeBody(init.body)
  });

  const response = await fetch(url, init);
  const raw = await response.text();
  const body = raw ? (JSON.parse(raw) as T) : null;

  console.info("[integration-hub][upstream][response]", {
    method,
    url,
    status: response.status,
    body: serializeBody(raw)
  });

  return {
    status: response.status,
    data: body
  };
}
