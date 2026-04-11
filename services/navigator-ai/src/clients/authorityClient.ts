import { AppConfig } from "../config/env";
import { requestJson } from "./http";

export interface AuthorityDecision {
  allowed: boolean;
  requiresApproval?: boolean;
  requiredTier?: number;
  reasons?: string[];
}

export class AuthorityClient {
  constructor(private readonly config: AppConfig) {}

  async check(input: {
    actorId: string;
    action: string;
    domain: string;
    context: Record<string, unknown>;
  }): Promise<AuthorityDecision> {
    const response = await requestJson<AuthorityDecision>(`${this.config.authorityEngineUrl}/authority/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.authorityEngineApiKey
      },
      body: JSON.stringify(input)
    });

    return response.data;
  }
}
