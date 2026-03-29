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
      dotenv.config({ path: candidate, override: false });
      return;
    }
  }
}

loadLocalEnv();

export type LlmProvider = "azure" | "openai" | "deterministic";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  databasePath: string;
  pgeUrl: string;
  pgeApiKey: string;
  meshGatewayUrl: string;
  meshGatewayApiKey: string;
  meshAdapterId: string;
  authorityEngineUrl: string;
  authorityEngineApiKey: string;
  governanceEngineUrl: string;
  governanceEngineApiKey: string;
  eventProcessorUrl: string;
  eventProcessorApiKey: string;
  llmProvider: LlmProvider;
  azureOpenAiEndpoint: string;
  azureOpenAiApiKey: string;
  azureOpenAiDeployment: string;
  azureOpenAiApiVersion: string;
  azureOpenAiMaxTokens: number;
  openAiApiKey: string;
  openAiModel: string;
  openAiBaseUrl: string;
  openAiMaxTokens: number;
  deterministicSeed: string;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseLlmProvider(): LlmProvider {
  const defaultProvider = process.env.CI === "true" ? "deterministic" : "azure";
  const value = (process.env.LLM_PROVIDER ?? defaultProvider).toLowerCase();
  if (value === "azure" || value === "openai" || value === "deterministic") {
    return value;
  }

  throw new Error("Invalid LLM_PROVIDER. Supported values: azure, openai, deterministic");
}

export function loadConfig(): AppConfig {
  const llmProvider = parseLlmProvider();
  const usingAzure = llmProvider === "azure";
  const usingOpenAi = llmProvider === "openai";

  return {
    port: Number(process.env.PORT ?? 4006),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    databasePath: process.env.DATABASE_PATH ?? "navigator-ai.db",
    pgeUrl: required("PGE_URL", "http://localhost:4005"),
    pgeApiKey: required("PGE_API_KEY", "change-me"),
    meshGatewayUrl: required("MESH_GATEWAY_URL", "http://localhost:4003"),
    meshGatewayApiKey: required("MESH_GATEWAY_API_KEY", "change-me"),
    meshAdapterId: required("MESH_ADAPTER_ID", "foundation"),
    authorityEngineUrl: required("AUTHORITY_ENGINE_URL", "http://localhost:4001"),
    authorityEngineApiKey: required("AUTHORITY_ENGINE_API_KEY", "change-me"),
    governanceEngineUrl: required("GOVERNANCE_ENGINE_URL", "http://localhost:4002"),
    governanceEngineApiKey: required("GOVERNANCE_ENGINE_API_KEY", "change-me"),
    eventProcessorUrl: required("EVENT_PROCESSOR_URL", "http://localhost:4004"),
    eventProcessorApiKey: required("EVENT_PROCESSOR_API_KEY", "change-me"),
    llmProvider,
    azureOpenAiEndpoint: usingAzure ? required("AZURE_OPENAI_ENDPOINT") : process.env.AZURE_OPENAI_ENDPOINT ?? "",
    azureOpenAiApiKey: usingAzure ? required("AZURE_OPENAI_API_KEY") : process.env.AZURE_OPENAI_API_KEY ?? "",
    azureOpenAiDeployment: usingAzure ? required("AZURE_OPENAI_DEPLOYMENT") : process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
    azureOpenAiApiVersion: usingAzure
      ? required("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")
      : process.env.AZURE_OPENAI_API_VERSION ?? "2025-01-01-preview",
    azureOpenAiMaxTokens: Number(process.env.AZURE_OPENAI_MAX_TOKENS ?? 4096),
    openAiApiKey: usingOpenAi ? required("OPENAI_API_KEY") : process.env.OPENAI_API_KEY ?? "",
    openAiModel: usingOpenAi ? required("OPENAI_MODEL") : process.env.OPENAI_MODEL ?? "",
    openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openAiMaxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? 4096),
    deterministicSeed: process.env.LLM_DETERMINISTIC_SEED ?? "constitutional-erp"
  };
}
