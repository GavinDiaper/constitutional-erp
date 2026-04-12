type HeaderTuple = [string, string];
type LoggableHeaders = Headers | Array<[string, string] | string[]> | Record<string, unknown>;

const SENSITIVE_HEADER_KEYS = new Set([
  'x-api-key',
  'authorization',
  'cookie',
  'set-cookie'
]);

function normalizeHeaders(headers?: LoggableHeaders): HeaderTuple[] {
  if (!headers) {
    return [];
  }

  if (headers instanceof Headers) {
    return Array.from(headers.entries());
  }

  if (Array.isArray(headers)) {
    return headers.map((entry) => [String(entry[0] ?? ""), String(entry[1] ?? "")]);
  }

  return Object.entries(headers).map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, value.join(",")];
    }

    return [key, String(value ?? "")];
  });
}

function redactHeaderValue(key: string, value: string): string {
  if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
    return '[REDACTED]';
  }

  return value;
}

function truncate(value: string, maxLength = 2000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...<truncated>` : value;
}

export function sanitizeHeaders(headers?: LoggableHeaders): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of normalizeHeaders(headers)) {
    output[key.toLowerCase()] = redactHeaderValue(key, value);
  }

  return output;
}

export function serializeBody(body: unknown): string {
  if (body === undefined || body === null) {
    return '';
  }

  if (typeof body === 'string') {
    return truncate(body);
  }

  try {
    return truncate(JSON.stringify(body));
  } catch {
    return '[unserializable-body]';
  }
}
