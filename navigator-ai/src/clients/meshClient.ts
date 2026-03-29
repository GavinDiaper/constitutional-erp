import { AppConfig } from "../config/env";
import { requestJsonAllowError } from "./http";

export class MeshClient {
  constructor(private readonly config: AppConfig) {}

  async execute(input: {
    domain: string;
    aggregateType: string;
    aggregateId: string;
    actionId: string;
    actorId: string;
    payload: Record<string, unknown>;
  }): Promise<{ status: number; data: Record<string, unknown> }> {
    const url = `${this.config.meshGatewayUrl}/mesh/${this.config.meshAdapterId}/${input.domain.toLowerCase()}/${input.aggregateType}/${input.aggregateId}/${input.actionId}`;
    return requestJsonAllowError<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.meshGatewayApiKey,
        "x-actor-id": input.actorId
      },
      body: JSON.stringify(input.payload)
    });
  }
}
