import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export interface ReplConfig {
  navigatorUrl: string;
  navigatorApiKey: string;
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
    navigatorUrl: process.env.NAVIGATOR_URL ?? process.env.NAVIGATOR_API_URL ?? "http://localhost:4016",
    navigatorApiKey: required("NAVIGATOR_API_KEY", "change-me")
  };
}
