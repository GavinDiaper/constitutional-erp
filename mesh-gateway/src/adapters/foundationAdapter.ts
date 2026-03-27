import { AppConfig } from "../config/env";
import { parseDomainSegment } from "../domain/contextBuilders";
import { LinkDef } from "../domain/types";
import { requestJson, requestJsonAllowError } from "../clients/http";
import { HttpError } from "../utils/errors";
import { BackendAdapter, CanonicalResource } from "./types";

interface ParsedMeshPath {
  domain: string;
  resource: string;
  id: string;
  action?: string;
}

function parseMeshPath(meshPath: string): ParsedMeshPath {
  const clean = meshPath.split("?")[0];
  const parts = clean.split("/").filter(Boolean);

  if (parts.length < 4 || parts[0].toLowerCase() !== "mesh") {
    throw new HttpError(400, "invalid_mesh_path", `Invalid mesh path: ${meshPath}`);
  }

  return {
    domain: parts[1].toLowerCase(),
    resource: parts[2].toLowerCase(),
    id: parts[3],
    action: parts[4]
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapLinks(rawValue: unknown): Record<string, LinkDef> {
  const raw = asRecord(rawValue);
  const links: Record<string, LinkDef> = {};

  for (const [name, candidate] of Object.entries(raw)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const c = candidate as Record<string, unknown>;
    const method = String(c.method ?? "GET").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      continue;
    }

    const href = String(c.href ?? "");
    links[name] = {
      href: href.startsWith("/api/v1/") ? href.replace("/api/v1/", "/mesh/") : href,
      method: method as LinkDef["method"]
    };
  }

  return links;
}

export class FoundationAdapter implements BackendAdapter {
  readonly id = "foundation";

  constructor(private readonly config: AppConfig) {}

  canHandle(meshPath: string): boolean {
    return meshPath.toLowerCase().startsWith("/mesh/");
  }

  private headers() {
    return {
      "content-type": "application/json",
      "x-api-key": this.config.adapterApiKey,
      [this.config.adapterIngressIdHeader]: this.config.adapterIngressId
    };
  }

  async fetchResource(meshPath: string, _headers: Record<string, string>) {
    const route = parseMeshPath(meshPath);
    const backendPath = `${this.config.adapterBackendBasePath}/${route.domain}/${route.resource}/${route.id}`;
    const upstream = await requestJson<Record<string, unknown>>(`${this.config.adapterBaseUrl}${backendPath}`, {
      method: "GET",
      headers: this.headers()
    });

    const raw = asRecord(upstream.data);
    const domain = parseDomainSegment(route.domain);
    const attributes = { ...raw };
    delete attributes._links;

    const canonical: CanonicalResource = {
      id: String(raw.id ?? route.id),
      domain,
      type: route.resource,
      attributes,
      links: mapLinks(raw._links)
    };

    return {
      status: upstream.status,
      resource: canonical
    };
  }

  async executeAction(meshPath: string, body: unknown, _headers: Record<string, string>) {
    const route = parseMeshPath(meshPath);
    if (!route.action) {
      throw new HttpError(400, "invalid_mesh_action_path", `Expected action segment in path: ${meshPath}`);
    }

    const backendPath = `${this.config.adapterBackendBasePath}/${route.domain}/${route.resource}/${route.id}/${route.action}`;
    return requestJsonAllowError<unknown>(`${this.config.adapterBaseUrl}${backendPath}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {})
    });
  }

  async health(): Promise<boolean> {
    const response = await fetch(`${this.config.adapterBaseUrl}/health`);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string };
    return payload.status === "ok";
  }
}
