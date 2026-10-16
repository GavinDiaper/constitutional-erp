import { createHmac } from "node:crypto";
import { AppConfig } from "../config/env";
import { parseDomainSegment } from "../domain/contextBuilders";
import { LinkDef } from "../domain/types";
import { requestJson, requestJsonAllowError } from "../clients/http";
import { HttpError } from "../utils/errors";
import { BackendAdapter, CanonicalResource } from "./types";

interface ParsedMeshPath {
  adapterId: string;
  domain: string;
  resource: string;
  id: string;
  action?: string;
}

function parseMeshCollectionPath(meshPath: string): { adapterId: string; domain: string; resource: string } {
  const parts = meshPath.split("?")[0].split("/").filter(Boolean);
  if (parts.length < 4 || parts[0].toLowerCase() !== "mesh") {
    throw new HttpError(400, "invalid_mesh_path", `Invalid mesh path: ${meshPath}`);
  }

  return { adapterId: parts[1], domain: parts[2].toLowerCase(), resource: parts[3].toLowerCase() };
}

function parseMeshPath(meshPath: string): ParsedMeshPath {
  const clean = meshPath.split("?")[0];
  const parts = clean.split("/").filter(Boolean);

  if (parts.length < 5 || parts[0].toLowerCase() !== "mesh") {
    throw new HttpError(400, "invalid_mesh_path", `Invalid mesh path: ${meshPath}`);
  }

  return {
    adapterId: parts[1],
    domain: parts[2].toLowerCase(),
    resource: parts[3].toLowerCase(),
    id: parts[4],
    action: parts[5]
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

const BACKEND_RESOURCE_BY_DOMAIN: Record<string, Record<string, string>> = {
  o2c: {
    quote: "quotes",
    "sales-order": "orders",
    "ar-invoice": "invoices",
    "ar-payment": "payments"
  },
  p2p: {
    supplier: "suppliers",
    requisition: "requisitions",
    "purchase-order": "purchase-orders",
    "goods-receipt": "goods-receipts",
    "supplier-invoice": "supplier-invoices",
    "ap-payment": "ap-payments"
  },
  r2r: {
    account: "accounts",
    "fiscal-year": "fiscal-years",
    "fiscal-period": "fiscal-periods",
    journal: "journals"
  },
  h2r: {
    employee: "employees",
    position: "positions",
    assignment: "assignments",
    credential: "credentials",
    "authority-rule": "authority-rules"
  }
};

function toBackendResourcePath(domain: string, resource: string): string {
  return BACKEND_RESOURCE_BY_DOMAIN[domain]?.[resource] ?? resource;
}

// Resources whose Foundation route does not follow /<domain>/<resource>.
const BACKEND_COLLECTION_OVERRIDES: Record<string, string> = {
  "o2c/contract": "/o2c/contracts",
  "o2c/contracts": "/o2c/contracts",
  "proj/project": "/projects",
  "proj/projects": "/projects"
};

function toBackendCollectionPath(domain: string, resource: string): string {
  return BACKEND_COLLECTION_OVERRIDES[`${domain}/${resource}`] ?? `/${domain}/${toBackendResourcePath(domain, resource)}`;
}

function normalizeAction(action: string): string {
  return action.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function toBackendAction(domain: string, resource: string, action: string): string {
  const actionKey = normalizeAction(action);

  if (domain === "p2p" && resource === "goods-receipt") {
    if (actionKey === "receivegoods") {
      return "receive";
    }

    if (actionKey === "acceptgoods") {
      return "accept";
    }
  }

  if (domain === "r2r" && resource === "journal") {
    if (actionKey === "postjournal") {
      return "post";
    }

    if (actionKey === "reversejournal") {
      return "reverse";
    }

    if (actionKey === "canceljournal") {
      return "cancel";
    }
  }

  if (domain === "o2c" && (resource === "contract" || resource === "contracts")) {
    if (actionKey === "amend") {
      return "amendments";
    }
  }

  if (domain === "o2c" && resource === "quote") {
    if (actionKey === "converttoorder") {
      return "convert";
    }
  }

  if (domain === "p2p" && resource === "requisition") {
    if (actionKey === "converttopo") {
      return "convert";
    }
  }

  if (domain === "p2p" && resource === "supplier") {
    if (actionKey === "reactivate") {
      return "activate";
    }
  }

  if (domain === "h2r" && resource === "employee") {
    if (actionKey === "placeonleave") {
      return "leave";
    }

    if (actionKey === "returnfromleave") {
      return "return";
    }

    if (actionKey === "terminateemployee") {
      return "terminate";
    }

    if (actionKey === "activateemployee") {
      return "activate";
    }
  }

  return action;
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
      href: href.startsWith("/api/v1/projects") ? href.replace("/api/v1/", `${publicBasePath}proj/`)
        : href.startsWith("/api/v1/") ? href.replace("/api/v1/", publicBasePath) : href,
      method: method as LinkDef["method"]
    };
  }

  return links;
}

export function signMeshActor(secret: string, actorId: string, tier: string, ts: string): string {
  return createHmac("sha256", secret).update(`${actorId}|${tier}|${ts}`).digest("hex");
}

export class FoundationAdapter implements BackendAdapter {
  constructor(private readonly config: AppConfig) {}

  get id() {
    return this.config.foundationAdapterId;
  }

  canHandle(meshPath: string): boolean {
    try {
      const parsed = parseMeshCollectionPath(meshPath);
      return parsed.adapterId.toLowerCase() === this.id.toLowerCase();
    } catch {
      return false;
    }
  }

  buildMeshPath(domain: string, resource: string, id: string, action?: string): string {
    const prefix = `/mesh/${this.id}`;
    return action
      ? `${prefix}/${domain}/${resource}/${id}/${action}`
      : `${prefix}/${domain}/${resource}/${id}`;
  }

  private headers(forwarded: Record<string, string>) {
    const baseHeaders: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": this.config.foundationAdapterApiKey,
      [this.config.foundationAdapterIngressIdHeader]: this.config.foundationAdapterIngressId
    };

    const actorId = forwarded["x-actor-id"];
    const actorTier = forwarded["x-actor-tier"];
    if (this.config.meshAssertionSecret && actorId && actorTier) {
      const ts = String(Date.now());
      baseHeaders["x-mesh-actor-ts"] = ts;
      baseHeaders["x-mesh-actor-sig"] = signMeshActor(this.config.meshAssertionSecret, actorId, actorTier, ts);
    }

    const passthrough = [
      "authorization",
      "x-actor-id",
      "x-actor-tier",
      "x-identity-id",
      "x-actor-email",
      "x-actor-h2r-employee-id"
    ];

    for (const key of passthrough) {
      const value = forwarded[key];
      if (value && value.trim()) {
        baseHeaders[key] = value;
      }
    }

    return baseHeaders;
  }

  async fetchResource(meshPath: string, headers: Record<string, string>) {
    const route = parseMeshPath(meshPath);
    const backendPath = `${this.config.foundationAdapterBackendBasePath}${toBackendCollectionPath(route.domain, route.resource)}/${route.id}`;
    const upstream = await requestJson<Record<string, unknown>>(`${this.config.foundationAdapterBaseUrl}${backendPath}`, {
      method: "GET",
      headers: this.headers(headers)
    });

    const envelope = asRecord(upstream.data);
    const raw = envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data) ? asRecord(envelope.data) : envelope;
    const linkSource = raw._links ?? envelope._links;
    const domain = parseDomainSegment(route.domain);
    const attributes = { ...raw };
    delete attributes._links;

    const canonical: CanonicalResource = {
      id: String(raw.id ?? route.id),
      domain,
      type: route.resource,
      attributes,
      links: mapLinks(linkSource, `/mesh/${this.id}/`)
    };

    return {
      status: upstream.status,
      resource: canonical
    };
  }

  async executeAction(meshPath: string, body: unknown, headers: Record<string, string>) {
    const route = parseMeshPath(meshPath);
    if (!route.action) {
      throw new HttpError(400, "invalid_mesh_action_path", `Expected action segment in path: ${meshPath}`);
    }

    const backendAction = toBackendAction(route.domain, route.resource, route.action);
    const backendPath = `${this.config.foundationAdapterBackendBasePath}${toBackendCollectionPath(route.domain, route.resource)}/${route.id}/${backendAction}`;
    return requestJsonAllowError<unknown>(`${this.config.foundationAdapterBaseUrl}${backendPath}`, {
      method: "POST",
      headers: this.headers(headers),
      body: JSON.stringify(body ?? {})
    });
  }

  async createResource(meshPath: string, body: unknown, headers: Record<string, string>) {
    const route = parseMeshCollectionPath(meshPath);
    const backendPath = `${this.config.foundationAdapterBackendBasePath}${toBackendCollectionPath(route.domain, route.resource)}`;
    return requestJsonAllowError<unknown>(`${this.config.foundationAdapterBaseUrl}${backendPath}`, {
      method: "POST",
      headers: this.headers(headers),
      body: JSON.stringify(body ?? {})
    });
  }

  async getMcpFunction(functionName: string, headers: Record<string, string>) {
    const response = await requestJsonAllowError<{ data?: Array<{ name: string; domain: string; entity?: string; action?: string }> }>(
      `${this.config.foundationAdapterBaseUrl}${this.config.foundationAdapterBackendBasePath}/mcp/functions`,
      { method: "GET", headers: this.headers(headers) }
    );
    return response.data?.data?.find((fn) => fn.name === functionName) ?? null;
  }

  async invokeMcp(functionName: string, input: unknown, headers: Record<string, string>) {
    return requestJsonAllowError<unknown>(
      `${this.config.foundationAdapterBaseUrl}${this.config.foundationAdapterBackendBasePath}/mcp/invoke`,
      { method: "POST", headers: this.headers(headers), body: JSON.stringify({ functionName, input }) }
    );
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
