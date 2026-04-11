import { AppConfig } from "../config/env";
import { CanonicalResource, SessionContext } from "../contracts/navigatorTypes";
import { requestJson } from "./http";

function domainToSegment(domain: SessionContext["domain"]): string {
  return domain.toLowerCase();
}

export class PgeClient {
  constructor(private readonly config: AppConfig) {}

  async getResource(ctx: SessionContext): Promise<CanonicalResource> {
    const url = `${this.config.pgeUrl}/graph/${domainToSegment(ctx.domain)}/${ctx.aggregateType}/${ctx.aggregateId}`;
    const response = await requestJson<CanonicalResource>(url, {
      method: "GET",
      headers: {
        "x-api-key": this.config.pgeApiKey,
        "x-actor-id": ctx.actorId
      }
    });

    return response.data;
  }
}
