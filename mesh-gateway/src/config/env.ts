import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  actorIdHeader: string;
  databasePath: string;
  adapterBaseUrl: string;
  adapterApiKey: string;
  adapterIngressId: string;
  adapterIngressIdHeader: string;
  adapterBackendBasePath: string;
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
    adapterBaseUrl: required("ADAPTER_BASE_URL", "http://localhost:3000"),
    adapterApiKey: required("ADAPTER_API_KEY", "change-me"),
    adapterIngressId: required("ADAPTER_INGRESS_ID", "foundation-ingress"),
    adapterIngressIdHeader: required("ADAPTER_INGRESS_ID_HEADER", "x-ingress-id").toLowerCase(),
    adapterBackendBasePath: required("ADAPTER_BACKEND_BASE_PATH", "/api/v1"),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me")
  };
}
