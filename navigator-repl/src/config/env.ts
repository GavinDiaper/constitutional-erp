import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export interface ReplConfig {
  integrationHubUrl: string;
  integrationHubApiKey: string;
  eventProcessorUrl: string;
  eventProcessorApiKey: string;
  navigatorAiUrl: string;
  navigatorAiApiKey: string;
}

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

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(): ReplConfig {
  loadLocalEnv();

  return {
    integrationHubUrl: process.env.INTEGRATION_HUB_URL ?? process.env.HUB_URL ?? "http://localhost:4017",
    integrationHubApiKey: required("INTEGRATION_HUB_API_KEY", process.env.NAVIGATOR_API_KEY ?? "change-me"),
    eventProcessorUrl: process.env.EVENT_PROCESSOR_URL ?? "http://localhost:4004",
    eventProcessorApiKey: required("EVENT_PROCESSOR_API_KEY", process.env.NAVIGATOR_API_KEY ?? "change-me"),
    navigatorAiUrl: process.env.NAVIGATOR_AI_URL ?? "http://localhost:4006/api/v1",
    navigatorAiApiKey: required("NAVIGATOR_AI_API_KEY", process.env.NAVIGATOR_API_KEY ?? "change-me")
  };
}
