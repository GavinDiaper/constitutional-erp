import { AppConfig } from "../config/env";
import { parseDomainSegment } from "../domain/contextBuilders";
import { LinkDef } from "../domain/types";
import { requestJson, requestJsonAllowError } from "../clients/http";
import { HttpError } from "../utils/errors";
import { BackendAdapter, CanonicalResource } from "./types";

interface ParsedMeshPath {
  adapterId?: string;
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

  const explicitAdapter = parts.length >= 5 ? parts[1] : undefined;
  const offset = explicitAdapter ? 2 : 1;

  if (parts.length < offset + 3) {
    throw new HttpError(400, "invalid_mesh_path", `Invalid mesh path: ${meshPath}`);
  }

  return {
    adapterId: explicitAdapter,
    domain: parts[offset].toLowerCase(),
    resource: parts[offset + 1].toLowerCase(),
    id: parts[offset + 2],
    action: parts[offset + 3]
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapLinks(rawValue: unknown, publicBasePath: string): Record<string, LinkDef> {
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
      href: href.startsWith("/api/v1/") ? href.replace("/api/v1/", publicBasePath) : href,
      method: method as LinkDef["method"]
    };
  }

  return links;
}

export class FoundationAdapter implements BackendAdapter {
  constructor(private readonly config: AppConfig) {}

  get id() {
    return this.config.foundationAdapterId;
  }

  canHandle(meshPath: string): boolean {
    try {
      const parsed = parseMeshPath(meshPath);
      return !parsed.adapterId || parsed.adapterId.toLowerCase() === this.id.toLowerCase();
    } catch {
      return false;
    }
  }

  buildMeshPath(domain: string, resource: string, id: string, action?: string, explicit = false): string {
    const prefix = explicit ? `/mesh/${this.id}` : "/mesh";
    return action
      ? `${prefix}/${domain}/${resource}/${id}/${action}`
      : `${prefix}/${domain}/${resource}/${id}`;
  }

  private headers() {
    return {
      "content-type": "application/json",
      "x-api-key": this.config.foundationAdapterApiKey,
      [this.config.foundationAdapterIngressIdHeader]: this.config.foundationAdapterIngressId
    };
  }

  async fetchResource(meshPath: string, _headers: Record<string, string>) {
    const route = parseMeshPath(meshPath);
    const backendPath = `${this.config.foundationAdapterBackendBasePath}/${route.domain}/${route.resource}/${route.id}`;
    const upstream = await requestJson<Record<string, unknown>>(`${this.config.foundationAdapterBaseUrl}${backendPath}`, {
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
      links: mapLinks(raw._links, route.adapterId ? `/mesh/${this.id}/` : "/mesh/")
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

    const backendPath = `${this.config.foundationAdapterBackendBasePath}/${route.domain}/${route.resource}/${route.id}/${route.action}`;
    return requestJsonAllowError<unknown>(`${this.config.foundationAdapterBaseUrl}${backendPath}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {})
    });
  }

  async health(): Promise<boolean> {
    const response = await fetch(`${this.config.foundationAdapterBaseUrl}/health`);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string };
    return payload.status === "ok";
  }
}
