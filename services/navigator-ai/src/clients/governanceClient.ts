import { AppConfig } from "../config/env";
import { AuthorityDecision } from "./authorityClient";
import { requestJson } from "./http";

export interface GovernanceDecision {
  mode: "EXECUTE" | "REQUEST_APPROVAL" | "REJECT";
  requiredTier?: number;
  reasons: string[];
}

export class GovernanceClient {
  constructor(private readonly config: AppConfig) {}

  async evaluate(input: {
    actorId: string;
    action: string;
    domain: string;
    context: Record<string, unknown>;
    authorityDecision: AuthorityDecision;
  }): Promise<GovernanceDecision> {
    const response = await requestJson<GovernanceDecision>(`${this.config.governanceEngineUrl}/governance/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.governanceEngineApiKey
      },
      body: JSON.stringify(input)
    });

    return response.data;
  }
}
