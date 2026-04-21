import { AppConfig } from "../config/env";
import {
  CanonicalResource,
  CreateEntityResult,
  NavigatorCreateOperation,
  NavigatorLookupKind,
  SessionContext
} from "../contracts/navigatorTypes";
import { requestJsonAllowError, requestJson } from "./http";
import { HttpError } from "../utils/errors";

interface HubProcessLink {
  rel: string;
  href: string;
  method: string;
  requiredInput?: {
    type: string;
    required?: string[];
    properties?: Record<string, { type?: string; description?: string; [key: string]: unknown }>;
  };
  governance?: {
    riskLevel?: string;
    requiredTier?: number;
    governanceTag?: string;
  };
}

interface HubProcessResponse {
  entityType: string;
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  links: HubProcessLink[];
}

function normalizeDomain(aggregateType: string): string {
  return aggregateType;
}

interface QueryFallbackConfig {
  table: string;
  stateFields: string[];
}

const QUERY_FALLBACK_BY_AGGREGATE_TYPE: Record<string, QueryFallbackConfig> = {
  project: { table: "proj_project", stateFields: ["status", "state"] },
  wip: { table: "proj_wip", stateFields: ["status", "state"] },
  "bom-assignment": { table: "proj_bom_assignment", stateFields: ["status", "state"] },
  "labor-entry": { table: "proj_labor_entry", stateFields: ["status", "state"] },
  "finished-item": { table: "proj_finished_item", stateFields: ["status", "state"] },
  sku: { table: "inv_sku", stateFields: ["status", "state"] },
  organization: { table: "inv_organization", stateFields: ["status", "state"] },
  movement: { table: "inv_movement", stateFields: ["movement_type", "status", "state"] },
  reservation: { table: "inv_reservation", stateFields: ["status", "state"] },
  bin: { table: "inv_bin", stateFields: ["status", "state"] },
  bom: { table: "inv_bom_header", stateFields: ["status", "state"] }
};

function normalizeAggregateToken(input: string): string {
  return input.trim().toLowerCase();
}

function shouldUseQueryFallback(error: unknown): boolean {
  if (!(error instanceof HttpError)) {
    return false;
  }

  if (error.status !== 404) {
    return false;
  }

  return error.message.includes("Unsupported process entity") || error.message.includes("entity_not_supported");
}

function resolveStateFromRow(row: Record<string, unknown>, stateFields: string[]): string {
  for (const key of stateFields) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "Unknown";
}

function rowMatchesId(row: Record<string, unknown>, targetId: string): boolean {
  const candidates = [
    "id",
    "projectId",
    "project_id",
    "wipId",
    "wip_id",
    "skuId",
    "sku_id",
    "organizationId",
    "organization_id",
    "movementId",
    "movement_id",
    "reservationId",
    "reservation_id",
    "binId",
    "bin_id",
    "bomId",
    "bom_id",
    "assignmentId",
    "assignment_id",
    "entryId",
    "entry_id",
    "finishedItemId",
    "finished_item_id"
  ];

  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "string" && value === targetId) {
      return true;
    }
  }

  return false;
}

export class IntegrationHubClient {
  constructor(private readonly config: AppConfig) {}

  private static readonly defaultQueryLimit = 500;

  private headers(actorId: string): Record<string, string> {
    return {
      "x-api-key": this.config.integrationHubApiKey,
      "x-actor-id": actorId
    };
  }

  private foundationHeaders(actorId: string): Record<string, string> {
    return {
      "x-api-key": this.config.foundationErpApiKey,
      [this.config.foundationErpIngressIdHeader]: this.config.foundationErpIngressId,
      "x-actor-id": actorId,
      "x-actor-tier": "5"
    };
  }

  async getResource(ctx: SessionContext): Promise<CanonicalResource> {
    const url = `${this.config.integrationHubUrl}/api/v1/hub/process/${encodeURIComponent(ctx.aggregateType)}/${encodeURIComponent(ctx.aggregateId)}`;
    try {
      const response = await requestJson<HubProcessResponse>(url, {
        method: "GET",
        headers: this.headers(ctx.actorId)
      });

      const links: CanonicalResource["links"] = {};
      for (const link of response.data.links ?? []) {
        links[link.rel] = {
          href: link.href,
          method: link.method?.toUpperCase() === "GET" ? "GET" : "POST",
          rel: link.rel,
          requiredTier: link.governance?.requiredTier,
          riskLevel: link.governance?.riskLevel,
          inputSchema: link.requiredInput
        };
      }

      return {
        id: response.data.entityId,
        domain: normalizeDomain(response.data.entityType),
        type: response.data.entityType,
        state: response.data.state,
        attributes: response.data.attributes,
        links
      };
    } catch (error) {
      if (!shouldUseQueryFallback(error)) {
        throw error;
      }

      const aggregateToken = normalizeAggregateToken(ctx.aggregateType);
      const fallbackConfig = QUERY_FALLBACK_BY_AGGREGATE_TYPE[aggregateToken];
      if (!fallbackConfig) {
        throw error;
      }

      let queryRow: Record<string, unknown> | undefined;
      try {
        queryRow = await this.queryRow<Record<string, unknown>>({
          table: fallbackConfig.table,
          id: ctx.aggregateId,
          actorId: ctx.actorId
        });
      } catch {
        // Some tables are not resolvable via /query/{table}/{id}; fall back to list+scan.
        queryRow = undefined;
      }

      let resolvedRow = queryRow;
      if (!resolvedRow) {
        const rows = await this.queryTable<Record<string, unknown>>({
          table: fallbackConfig.table,
          actorId: ctx.actorId,
          limit: 1000,
          offset: 0
        });
        resolvedRow = rows.find((row) => rowMatchesId(row, ctx.aggregateId));
      }

      if (!resolvedRow) {
        throw error;
      }

      return {
        id: ctx.aggregateId,
        domain: ctx.domain,
        type: ctx.aggregateType,
        state: resolveStateFromRow(resolvedRow, fallbackConfig.stateFields),
        attributes: resolvedRow,
        links: {}
      };
    }
  }

  async executeAction(input: {
    aggregateType: string;
    aggregateId: string;
    actionId: string;
    actorId: string;
    payload: Record<string, unknown>;
  }): Promise<{ status: number; data: Record<string, unknown> }> {
    const url = `${this.config.integrationHubUrl}/process/${encodeURIComponent(input.aggregateType)}/${encodeURIComponent(input.aggregateId)}/actions/${encodeURIComponent(input.actionId)}`;

    return requestJsonAllowError<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.headers(input.actorId)
      },
      body: JSON.stringify(input.payload)
    });
  }

  async createEntity(input: {
    operation: NavigatorCreateOperation;
    payload: Record<string, unknown>;
    actorId: string;
  }): Promise<CreateEntityResult> {
    const url = `${this.config.integrationHubUrl}/api/v1/hub/create/${encodeURIComponent(input.operation)}`;
    const response = await requestJson<CreateEntityResult>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.headers(input.actorId)
      },
      body: JSON.stringify(input.payload ?? {})
    });

    return response.data;
  }

  async addRequisitionLine(input: {
    requisitionId: string;
    actorId: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }): Promise<Record<string, unknown>> {
    const url = `${this.config.integrationHubUrl}/api/v1/hub/p2p/requisitions/${encodeURIComponent(input.requisitionId)}/lines`;
    const response = await requestJson<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.headers(input.actorId)
      },
      body: JSON.stringify({
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice
      })
    });

    return response.data;
  }

  async getCreateLookups(input: {
    kind: NavigatorLookupKind;
    actorId: string;
  }): Promise<Array<Record<string, unknown>>> {
    const url = `${this.config.integrationHubUrl}/api/v1/hub/create/lookups/${encodeURIComponent(input.kind)}`;
    const response = await requestJson<{ data?: Array<Record<string, unknown>> }>(url, {
      method: "GET",
      headers: this.headers(input.actorId)
    });

    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  async queryTable<T extends Record<string, unknown>>(input: {
    table: string;
    actorId: string;
    limit?: number;
    offset?: number;
  }): Promise<T[]> {
    const limit = input.limit ?? IntegrationHubClient.defaultQueryLimit;
    const offset = input.offset ?? 0;
    const url = `${this.config.foundationErpUrl}/api/v1/query/${encodeURIComponent(input.table)}?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
    const response = await requestJson<{ data?: T[] }>(url, {
      method: "GET",
      headers: this.foundationHeaders(input.actorId)
    });

    return Array.isArray(response.data.data) ? response.data.data : [];
  }

  async queryRow<T extends Record<string, unknown>>(input: {
    table: string;
    id: string;
    actorId: string;
  }): Promise<T | undefined> {
    const url = `${this.config.foundationErpUrl}/api/v1/query/${encodeURIComponent(input.table)}/${encodeURIComponent(input.id)}`;
    const response = await requestJson<{ data?: T }>(url, {
      method: "GET",
      headers: this.foundationHeaders(input.actorId)
    });

    return response.data.data;
  }
}
