import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function loadLocalEnv() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.example")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      return;
    }
  }
}

loadLocalEnv();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  databasePath: string;
  pgeUrl: string;
  pgeApiKey: string;
  meshGatewayUrl: string;
  meshGatewayApiKey: string;
  authorityEngineUrl: string;
  authorityEngineApiKey: string;
  governanceEngineUrl: string;
  governanceEngineApiKey: string;
  eventProcessorUrl: string;
  eventProcessorApiKey: string;
  azureOpenAiEndpoint: string;
  azureOpenAiApiKey: string;
  azureOpenAiDeployment: string;
  azureOpenAiApiVersion: string;
  azureOpenAiMaxTokens: number;
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
    port: Number(process.env.PORT ?? 4006),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    databasePath: process.env.DATABASE_PATH ?? "navigator-ai.db",
    pgeUrl: required("PGE_URL", "http://localhost:4005"),
    pgeApiKey: required("PGE_API_KEY", "change-me"),
    meshGatewayUrl: required("MESH_GATEWAY_URL", "http://localhost:4003"),
    meshGatewayApiKey: required("MESH_GATEWAY_API_KEY", "change-me"),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me"),
    eventProcessorUrl: required("EVENT_PROCESSOR_URL", "http://localhost:4004"),
    eventProcessorApiKey: required("EVENT_PROCESSOR_API_KEY", "change-me"),
    azureOpenAiEndpoint: required("AZURE_OPENAI_ENDPOINT"),
    azureOpenAiApiKey: required("AZURE_OPENAI_API_KEY"),
    azureOpenAiDeployment: required("AZURE_OPENAI_DEPLOYMENT"),
    azureOpenAiApiVersion: required("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
    azureOpenAiMaxTokens: Number(process.env.AZURE_OPENAI_MAX_TOKENS ?? 4096)
  };
}
