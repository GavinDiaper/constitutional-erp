import { AppConfig } from "../config/env";
import { AuthorityCheckResult, AuthorityDomain } from "../domain/types";
import { requestJson } from "./http";

interface EligibleApproversResponse {
  approvers: string[];
}

export class AuthorityClient {
  constructor(private readonly config: AppConfig) {}

  async check(input: { actorId: string; action: string; domain: AuthorityDomain; context: Record<string, unknown> }) {
    const response = await requestJson<AuthorityCheckResult>(`${this.config.authorityEngineUrl}/authority/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.authorityEngineApiKey
      },
      body: JSON.stringify(input)
    });

    return response.data;
  }

  async getEligibleApprovers(domain: AuthorityDomain, tier: number): Promise<string[]> {
    const params = new URLSearchParams({ domain, tier: String(tier) });
    const response = await requestJson<EligibleApproversResponse>(
      `${this.config.authorityEngineUrl}/authority/eligible-approvers?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "x-api-key": this.config.authorityEngineApiKey
        }
      }
    );

    return response.data.approvers;
  }

  async health(): Promise<boolean> {
    const response = await fetch(`${this.config.authorityEngineUrl}/health`);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string; replayStatus?: string };
    return payload.status === "ok" && payload.replayStatus === "Ready";
  }
}
