import { loadConfig } from "../config/env";
import { AuthorityCheckResult } from "./authorityClient";

export interface GovernanceCheckInput {
  actorId: string;
  action: string;
  domain: "P2P" | "O2C" | "R2R" | "H2R" | "INV";
  context: Record<string, unknown>;
  authorityDecision: AuthorityCheckResult;
}

export interface GovernanceCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  requiredApproverTier?: number;
  escalatedToTier?: number;
  riskLevel?: string;
  violations: string[];
  constraints: string[];
  matchedRules: string[];
}

export async function evaluateGovernance(input: GovernanceCheckInput): Promise<GovernanceCheckResult> {
  const config = loadConfig();
  const url = `${config.governanceEngineUrl}/governance/evaluate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": config.governanceEngineApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Governance client: engine returned ${response.status}: ${text}`);
  }

  return (await response.json()) as GovernanceCheckResult;
}
