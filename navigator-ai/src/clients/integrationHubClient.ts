import { AppConfig } from "../config/env";
import { CanonicalResource, SessionContext } from "../contracts/navigatorTypes";
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

  async getResource(ctx: SessionContext): Promise<CanonicalResource> {
    const url = `${this.config.integrationHubUrl}/api/v1/hub/process/${encodeURIComponent(ctx.aggregateType)}/${encodeURIComponent(ctx.aggregateId)}`;
    const response = await requestJson<HubProcessResponse>(url, {
      method: "GET",
      headers: {
        "x-api-key": this.config.integrationHubApiKey,
        "x-actor-id": ctx.actorId
      }
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
        "x-api-key": this.config.integrationHubApiKey,
        "x-actor-id": input.actorId
      },
      body: JSON.stringify(input.payload)
    });
  }
}
