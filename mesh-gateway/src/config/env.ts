import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  actorIdHeader: string;
  databasePath: string;
  foundationErpUrl: string;
  foundationErpApiKey: string;
  foundationErpIngressId: string;
  foundationErpIngressIdHeader: string;
  authorityEngineUrl: string;
  authorityEngineApiKey: string;
  governanceEngineUrl: string;
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
    port: Number(process.env.PORT ?? 4003),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    actorIdHeader: required("ACTOR_ID_HEADER", "x-actor-id").toLowerCase(),
    databasePath: process.env.DATABASE_PATH ?? "mesh-gateway.db",
    foundationErpUrl: required("FOUNDATION_ERP_URL", "http://localhost:3000"),
    foundationErpApiKey: required("FOUNDATION_ERP_API_KEY", "change-me"),
    foundationErpIngressId: required("FOUNDATION_ERP_INGRESS_ID", "foundation-ingress"),
    foundationErpIngressIdHeader: required("FOUNDATION_ERP_INGRESS_ID_HEADER", "x-ingress-id").toLowerCase(),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me")
  };
}
