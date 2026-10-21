import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  internalAllowlist: string[];
  ingressIdHeader: string;
  ingressIdValue: string;
  databasePath: string;
  authorityEngineUrl?: string;
  authorityEngineApiKey: string;
  governanceEngineUrl?: string;
  governanceEngineApiKey: string;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    internalAllowlist: (process.env.INTERNAL_ALLOWLIST ?? "127.0.0.1,::1")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ingressIdHeader: (process.env.INGRESS_ID_HEADER ?? "x-ingress-id").toLowerCase(),
    ingressIdValue: process.env.INGRESS_ID_VALUE ?? "foundation-ingress",
    databasePath: process.env.DATABASE_PATH ?? "foundation.db",
    // Optional: only the authority_* and gov_* MCP read tools need these.
    authorityEngineUrl: process.env.AUTHORITY_ENGINE_URL?.replace(/\/+$/, ""),
    authorityEngineApiKey: process.env.AUTHORITY_ENGINE_API_KEY ?? "change-me",
    governanceEngineUrl: process.env.GOVERNANCE_ENGINE_URL?.replace(/\/+$/, ""),
    governanceEngineApiKey: process.env.GOVERNANCE_ENGINE_API_KEY ?? "change-me"
  };
}
