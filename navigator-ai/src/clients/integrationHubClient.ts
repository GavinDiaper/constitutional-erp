import { AppConfig } from "../config/env";
import {
  CanonicalResource,
  CreateEntityResult,
  NavigatorCreateOperation,
  NavigatorLookupKind,
  SessionContext
} from "../contracts/navigatorTypes";
import { requestJsonAllowError, requestJson } from "./http";

interface HubProcessLink {
  rel: string;
  href: string;
  method: string;
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

export class IntegrationHubClient {
  constructor(private readonly config: AppConfig) {}

  private headers(actorId: string): Record<string, string> {
    return {
      "x-api-key": this.config.integrationHubApiKey,
      "x-actor-id": actorId
    };
  }

  async getResource(ctx: SessionContext): Promise<CanonicalResource> {
    const url = `${this.config.integrationHubUrl}/api/v1/hub/process/${encodeURIComponent(ctx.aggregateType)}/${encodeURIComponent(ctx.aggregateId)}`;
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
        riskLevel: link.governance?.riskLevel
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
}
