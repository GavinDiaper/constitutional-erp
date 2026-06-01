import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  databasePath: string;
  corsOrigins: string[];
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return ["http://localhost:5175", "http://127.0.0.1:5175"];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3011),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    databasePath: process.env.DATABASE_PATH ?? "erp-mapping-tool.db",
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS)
  };
}
