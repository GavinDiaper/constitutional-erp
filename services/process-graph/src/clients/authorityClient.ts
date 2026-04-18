import { loadConfig } from "../config/env";

export interface AuthorityCheckInput {
  actorId: string;
  action: string;
  domain: "P2P" | "O2C" | "R2R" | "H2R" | "INV";
  context?: Record<string, unknown>;
}

export interface AuthorityCheckResult {
  allowed: boolean;
  effectiveTier?: number;
  requiredTier?: number;
  reasons: string[];
}

export async function checkAuthority(input: AuthorityCheckInput): Promise<AuthorityCheckResult> {
  const config = loadConfig();
  const url = `${config.authorityEngineUrl}/authority/check`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": config.authorityEngineApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Authority client: engine returned ${response.status}: ${text}`);
  }

  return (await response.json()) as AuthorityCheckResult;
}
