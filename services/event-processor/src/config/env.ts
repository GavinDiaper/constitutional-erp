import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  databasePath: string;
  pollIntervalMs: number;
  foundationErpUrl: string;
  foundationErpApiKey: string;
  foundationErpIngressId: string;
  foundationErpIngressIdHeader: string;
  meshGatewayUrl: string;
  meshGatewayApiKey: string;
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
    port: Number(process.env.PORT ?? 4004),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    databasePath: process.env.DATABASE_PATH ?? "event-processor.db",
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
    foundationErpUrl: required("FOUNDATION_ERP_URL", "http://localhost:3000"),
    foundationErpApiKey: required("FOUNDATION_ERP_API_KEY", "change-me"),
    foundationErpIngressId: required("FOUNDATION_ERP_INGRESS_ID", "foundation-ingress"),
    foundationErpIngressIdHeader: required("FOUNDATION_ERP_INGRESS_ID_HEADER", "x-ingress-id").toLowerCase(),
    meshGatewayUrl: required("MESH_GATEWAY_URL", "http://localhost:4003"),
    meshGatewayApiKey: required("MESH_GATEWAY_API_KEY", "change-me"),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me")
  };
}