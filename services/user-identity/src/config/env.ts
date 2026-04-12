import "dotenv/config";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databasePath: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtSigningSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  adminSecret: string;
  cookieDomain: string | null;
  cookieSecure: boolean;
  oauthMockEnabled: boolean;
  providers: {
    google: OAuthProviderConfig;
    microsoft: OAuthProviderConfig;
    apple: OAuthProviderConfig;
  };
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function asNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }

  return parsed;
}

function asBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function provider(prefix: "GOOGLE" | "MICROSOFT" | "APPLE", fallbackRedirectUri: string): OAuthProviderConfig {
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`] ?? "",
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] ?? "",
    redirectUri: required(`${prefix}_REDIRECT_URI`, fallbackRedirectUri)
  };
}

export function loadConfig(): AppConfig {
  return {
    port: asNumber("PORT", 4008),
    nodeEnv: process.env.NODE_ENV ?? "development",
    databasePath: process.env.DATABASE_PATH ?? "user-identity.db",
    jwtIssuer: required("JWT_ISSUER", "constitutionalerp-user-identity"),
    jwtAudience: required("JWT_AUDIENCE", "constitutionalerp-clients"),
    jwtSigningSecret: required("JWT_SIGNING_SECRET", "change-me-signing-secret"),
    accessTokenTtlSeconds: asNumber("ACCESS_TOKEN_TTL_SECONDS", 900),
    refreshTokenTtlSeconds: asNumber("REFRESH_TOKEN_TTL_SECONDS", 60 * 60 * 24 * 7),
    adminSecret: required("ADMIN_SECRET", "change-me-admin-secret"),
    cookieDomain: process.env.COOKIE_DOMAIN?.trim() || null,
    cookieSecure: asBoolean("COOKIE_SECURE", false),
    oauthMockEnabled: asBoolean("OAUTH_MOCK_ENABLED", true),
    providers: {
      google: provider("GOOGLE", "http://localhost:4008/auth/callback/google"),
      microsoft: provider("MICROSOFT", "http://localhost:4008/auth/callback/microsoft"),
      apple: provider("APPLE", "http://localhost:4008/auth/callback/apple")
    }
  };
}
