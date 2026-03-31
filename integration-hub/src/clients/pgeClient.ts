import { AppConfig } from "../config/env";
import { requestJson, requestJsonAllowError } from "./http";

export interface PgeLink {
  href: string;
  method: string;
  rel?: string;
  requiresApproval?: boolean;
  requiredTier?: number;
}

export interface PgeResource {
  id: string;
  domain: string;
  type: string;
  state: string;
  attributes: Record<string, unknown>;
  links: Record<string, PgeLink>;
}

export class PgeClient {
  constructor(private readonly config: AppConfig) {}

  async getResource(input: {
    domain: string;
    aggregateType: string;
    aggregateId: string;
    actorId?: string;
  }): Promise<PgeResource> {
    const url = `${this.config.pgeUrl}/graph/${input.domain}/${input.aggregateType}/${input.aggregateId}`;

    return requestJson<PgeResource>(url, {
      method: "GET",
      headers: {
        "x-api-key": this.config.pgeApiKey,
        ...(input.actorId ? { "x-actor-id": input.actorId } : {})
      }
    });
  }

  async postAction(input: {
    domain: string;
    aggregateType: string;
    aggregateId: string;
    action: string;
    payload: Record<string, unknown>;
    actorId: string;
  }): Promise<{ status: number; data: PgeResource | Record<string, unknown> | null }> {
    const url = `${this.config.pgeUrl}/graph/${input.domain}/${input.aggregateType}/${input.aggregateId}/${input.action}`;

    return requestJsonAllowError<PgeResource | Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.pgeApiKey,
        "x-actor-id": input.actorId
      },
      body: JSON.stringify(input.payload)
    });
  }
}
