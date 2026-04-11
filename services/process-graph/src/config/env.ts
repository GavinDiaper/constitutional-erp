import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  databasePath: string;
  eventProcessorUrl: string;
  eventProcessorApiKey: string;
  authorityEngineUrl: string;
  authorityEngineApiKey: string;
  governanceEngineUrl: string;
  governanceEngineApiKey: string;
  meshGatewayUrl: string;
  meshGatewayApiKey: string;
  meshDelegationEnabled: boolean;
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
    port: Number(process.env.PORT ?? 4005),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    databasePath: process.env.DATABASE_PATH ?? "process-graph.db",
    eventProcessorUrl: required("EVENT_PROCESSOR_URL", "http://localhost:4004"),
    eventProcessorApiKey: required("EVENT_PROCESSOR_API_KEY", "change-me"),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me"),
    meshGatewayUrl: required("MESH_GATEWAY_URL", "http://localhost:4003"),
    meshGatewayApiKey: required("MESH_GATEWAY_API_KEY", "change-me"),
    meshDelegationEnabled: (process.env.MESH_DELEGATION_ENABLED ?? "false").toLowerCase() === "true"
  };
}
