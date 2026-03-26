import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  internalAllowlist: string[];
  ingressIdHeader: string;
  ingressIdValue: string;
  databasePath: string;
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
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    internalAllowlist: (process.env.INTERNAL_ALLOWLIST ?? "127.0.0.1,::1")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ingressIdHeader: (process.env.INGRESS_ID_HEADER ?? "x-ingress-id").toLowerCase(),
    ingressIdValue: process.env.INGRESS_ID_VALUE ?? "foundation-ingress",
    databasePath: process.env.DATABASE_PATH ?? "foundation.db"
  };
}
