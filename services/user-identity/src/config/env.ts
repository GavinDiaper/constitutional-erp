import "dotenv/config";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string;
  jwksUrl: string;
  expectedIssuer: string;
  expectedIssuerPrefix: string;
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
  h2rAutoLinkEnabled: boolean;
  foundationErpUrl: string;
  foundationErpApiKey: string;
  foundationErpIngressId: string;
  h2rLookupTimeoutMs: number;
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

function provider(
  prefix: "GOOGLE" | "MICROSOFT" | "APPLE",
  fallbackRedirectUri: string,
  defaults: {
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string;
    jwksUrl: string;
    expectedIssuer: string;
    expectedIssuerPrefix: string;
  }
): OAuthProviderConfig {
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`] ?? "",
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] ?? "",
    redirectUri: required(`${prefix}_REDIRECT_URI`, fallbackRedirectUri),
    authorizationUrl: required(`${prefix}_AUTHORIZATION_URL`, defaults.authorizationUrl),
    tokenUrl: required(`${prefix}_TOKEN_URL`, defaults.tokenUrl),
    userInfoUrl: process.env[`${prefix}_USERINFO_URL`] ?? defaults.userInfoUrl,
    scopes: required(`${prefix}_SCOPES`, defaults.scopes),
    jwksUrl: required(`${prefix}_JWKS_URL`, defaults.jwksUrl),
    expectedIssuer: process.env[`${prefix}_EXPECTED_ISSUER`] ?? defaults.expectedIssuer,
    expectedIssuerPrefix: process.env[`${prefix}_EXPECTED_ISSUER_PREFIX`] ?? defaults.expectedIssuerPrefix
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
    h2rAutoLinkEnabled: asBoolean("H2R_AUTO_LINK_ENABLED", false),
    foundationErpUrl: required("FOUNDATION_ERP_URL", "http://localhost:3000/api/v1"),
    foundationErpApiKey: required("FOUNDATION_ERP_API_KEY", "change-me"),
    foundationErpIngressId: required("FOUNDATION_ERP_INGRESS_ID", "foundation-ingress"),
    h2rLookupTimeoutMs: asNumber("H2R_LOOKUP_TIMEOUT_MS", 1500),
    providers: {
      google: provider("GOOGLE", "http://localhost:4008/auth/callback/google", {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scopes: "openid email profile",
        jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
        expectedIssuer: "https://accounts.google.com",
        expectedIssuerPrefix: ""
      }),
      microsoft: provider("MICROSOFT", "http://localhost:4008/auth/callback/microsoft", {
        authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
        scopes: "openid email profile",
        jwksUrl: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
        expectedIssuer: "",
        expectedIssuerPrefix: "https://login.microsoftonline.com/"
      }),
      apple: provider("APPLE", "http://localhost:4008/auth/callback/apple", {
        authorizationUrl: "https://appleid.apple.com/auth/authorize",
        tokenUrl: "https://appleid.apple.com/auth/token",
        userInfoUrl: "",
        scopes: "name email",
        jwksUrl: "https://appleid.apple.com/auth/keys",
        expectedIssuer: "https://appleid.apple.com",
        expectedIssuerPrefix: ""
      })
    }
  };
}
