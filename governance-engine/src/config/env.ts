import "dotenv/config";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  databasePath: string;
  foundationErpUrl: string;
  foundationErpApiKey: string;
  foundationErpIngressId: string;
  foundationErpIngressIdHeader: string;
  pollIntervalMs: number;
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
    port: Number(process.env.PORT ?? 4002),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    databasePath: process.env.DATABASE_PATH ?? "governance.db",
    foundationErpUrl: required("FOUNDATION_ERP_URL", "http://localhost:3000"),
    foundationErpApiKey: required("FOUNDATION_ERP_API_KEY", "change-me"),
    foundationErpIngressId: required("FOUNDATION_ERP_INGRESS_ID", "foundation-ingress"),
    foundationErpIngressIdHeader: required("FOUNDATION_ERP_INGRESS_ID_HEADER", "x-ingress-id").toLowerCase(),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000)
  };
}
