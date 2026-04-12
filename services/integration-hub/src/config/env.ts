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
      dotenv.config({ path: candidate });
      return;
    }
  }
}

loadLocalEnv();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  apiKey: string;
  pgeUrl: string;
  pgeApiKey: string;
  meshGatewayUrl: string;
  meshGatewayApiKey: string;
  meshAdapterId: string;
  foundationErpUrl: string;
  foundationErpApiKey: string;
  foundationErpIngressIdHeader: string;
  foundationErpIngressId: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtSigningSecret: string;
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
    port: Number(process.env.PORT ?? 4017),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiKey: required("API_KEY", "change-me"),
    pgeUrl: required("PGE_URL", "http://localhost:4005"),
    pgeApiKey: required("PGE_API_KEY", "change-me"),
    meshGatewayUrl: required("MESH_GATEWAY_URL", "http://localhost:4003"),
    meshGatewayApiKey: required("MESH_GATEWAY_API_KEY", "change-me"),
    meshAdapterId: required("MESH_ADAPTER_ID", "foundation"),
    foundationErpUrl: required("FOUNDATION_ERP_URL", "http://localhost:3000"),
    foundationErpApiKey: required("FOUNDATION_ERP_API_KEY", "change-me"),
    foundationErpIngressIdHeader: required("FOUNDATION_ERP_INGRESS_ID_HEADER", "x-ingress-id"),
    foundationErpIngressId: required("FOUNDATION_ERP_INGRESS_ID", "foundation-ingress"),
    jwtIssuer: required("JWT_ISSUER", "constitutionalerp-user-identity"),
    jwtAudience: required("JWT_AUDIENCE", "constitutionalerp-clients"),
    jwtSigningSecret: required("JWT_SIGNING_SECRET", "change-me-signing-secret")
  };
}
