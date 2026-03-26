import { AppConfig } from "../config/env";
import { AuthorityCheckResult, GovernanceCheckResult, AuthorityDomain } from "../domain/types";
import { requestJson } from "./http";

export class GovernanceClient {
  constructor(private readonly config: AppConfig) {}

  async evaluate(input: {
    actorId: string;
    action: string;
    domain: AuthorityDomain;
    context: Record<string, unknown>;
    authorityDecision: AuthorityCheckResult;
  }): Promise<GovernanceCheckResult> {
    const response = await requestJson<GovernanceCheckResult>(`${this.config.governanceEngineUrl}/governance/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.governanceEngineApiKey
      },
      body: JSON.stringify(input)
    });

    return response.data;
  }

  async health(): Promise<boolean> {
    const response = await fetch(`${this.config.governanceEngineUrl}/health`);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string; replayStatus?: string };
    return payload.status === "ok" && payload.replayStatus === "Ready";
  }
}
