import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  actorIdHeader: string;
  databasePath: string;
  defaultAdapterId: string;
  foundationAdapterId: string;
  foundationAdapterBaseUrl: string;
  foundationAdapterApiKey: string;
  foundationAdapterIngressId: string;
  foundationAdapterIngressIdHeader: string;
  foundationAdapterBackendBasePath: string;
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
    defaultAdapterId: required("DEFAULT_ADAPTER_ID", process.env.FOUNDATION_ADAPTER_ID ?? "foundation"),
    foundationAdapterId: required("FOUNDATION_ADAPTER_ID", "foundation"),
    foundationAdapterBaseUrl: required("FOUNDATION_ADAPTER_BASE_URL", process.env.ADAPTER_BASE_URL ?? "http://localhost:3000"),
    foundationAdapterApiKey: required("FOUNDATION_ADAPTER_API_KEY", process.env.ADAPTER_API_KEY ?? "change-me"),
    foundationAdapterIngressId: required("FOUNDATION_ADAPTER_INGRESS_ID", process.env.ADAPTER_INGRESS_ID ?? "foundation-ingress"),
    foundationAdapterIngressIdHeader: required(
      "FOUNDATION_ADAPTER_INGRESS_ID_HEADER",
      process.env.ADAPTER_INGRESS_ID_HEADER ?? "x-ingress-id"
    ).toLowerCase(),
    foundationAdapterBackendBasePath: required(
      "FOUNDATION_ADAPTER_BACKEND_BASE_PATH",
      process.env.ADAPTER_BACKEND_BASE_PATH ?? "/api/v1"
    ),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me")
  };
}
