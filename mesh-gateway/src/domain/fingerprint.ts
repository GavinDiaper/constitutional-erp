import { createHash } from "node:crypto";

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function buildRequestFingerprint(parts: {
  actorId: string;
  action: string;
  domain: string;
  resourceId: string;
  body: unknown;
}): string {
  const source = `${parts.actorId}|${parts.action}|${parts.domain}|${parts.resourceId}|${canonicalize(parts.body)}`;
  return createHash("sha256").update(source).digest("hex");
}
