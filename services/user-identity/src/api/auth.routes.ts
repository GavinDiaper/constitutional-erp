import { randomUUID } from "node:crypto";
import { Router } from "express";
import { loadConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import { consumeRefreshToken, getIdentityById, issueRefreshToken, resolveIdentity, revokeRefreshToken } from "../domain/identityRepository";
import { createAccessToken, createRefreshToken, hashRefreshToken, verifyAccessToken } from "../domain/tokenService";

const config = loadConfig();

type ProviderName = "google" | "microsoft" | "apple";

function asProvider(value: string): ProviderName {
  if (value === "google" || value === "microsoft" || value === "apple") {
    return value;
  }

  throw new HttpError(404, "provider_not_supported", "Provider is not supported.");
}

function providerEnabled(provider: ProviderName): boolean {
  const providerConfig = config.providers[provider];
  return Boolean(providerConfig.clientId && providerConfig.redirectUri);
}

function parseBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "invalid_token", "Authorization header is missing or malformed.");
  }

  return authorization.slice("Bearer ".length).trim();
}

function issueSession(identity: ReturnType<typeof resolveIdentity>) {
  const accessToken = createAccessToken(identity);
  const refresh = createRefreshToken();
  issueRefreshToken(identity.identityId, refresh.tokenHash, refresh.expiresAt);

  return {
    accessToken,
    refreshToken: refresh.rawToken,
    tokenType: "Bearer",
    expiresIn: config.accessTokenTtlSeconds,
    identity: {
      identityId: identity.identityId,
      email: identity.email,
      provider: identity.externalProvider,
      h2rEmployeeId: identity.h2rEmployeeId,
      status: identity.status,
      isAdmin: identity.isAdmin
    }
  };
}

export const authRouter = Router();

authRouter.get("/auth/providers", (_req, res) => {
  res.json({
    providers: ["google", "microsoft", "apple"].map((provider) => ({
      name: provider,
      enabled: providerEnabled(provider as ProviderName)
    }))
  });
});

authRouter.get("/auth/login/:provider", (req, res) => {
  const provider = asProvider(req.params.provider);
  const state = randomUUID();
  const nonce = randomUUID();

  if (!providerEnabled(provider) && !config.oauthMockEnabled) {
    throw new HttpError(400, "provider_not_configured", `${provider} OAuth provider is not configured.`);
  }

  if (config.oauthMockEnabled) {
    const callbackUrl = new URL(config.providers[provider].redirectUri);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("nonce", nonce);
    callbackUrl.searchParams.set("email", String(req.query.email ?? `demo.${provider}@constitutionalerp.local`));
    callbackUrl.searchParams.set("sub", String(req.query.sub ?? `${provider}-${randomUUID()}`));

    if (typeof req.query.next === "string" && req.query.next.trim()) {
      callbackUrl.searchParams.set("next", req.query.next);
    }

    return res.redirect(callbackUrl.toString());
  }

  const authorizationUrl = new URL("https://example.invalid/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", config.providers[provider].clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.providers[provider].redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);

  if (typeof req.query.next === "string" && req.query.next.trim()) {
    authorizationUrl.searchParams.set("next", req.query.next);
  }

  return res.redirect(authorizationUrl.toString());
});

authRouter.get("/auth/callback/:provider", (req, res) => {
  const provider = asProvider(req.params.provider);
  const email = typeof req.query.email === "string" ? req.query.email : "";
  const subject = typeof req.query.sub === "string" ? req.query.sub : "";

  if (!config.oauthMockEnabled) {
    throw new HttpError(501, "provider_exchange_not_implemented", "Provider token exchange is not implemented yet.");
  }

  if (!email || !subject) {
    throw new HttpError(400, "invalid_callback_payload", "Callback must include email and sub in mock mode.");
  }

  const identity = resolveIdentity({
    externalProvider: provider,
    externalSubject: subject,
    email,
    h2rEmployeeId: null
  });

  const session = issueSession(identity);
  const next = typeof req.query.next === "string" && req.query.next.trim() ? req.query.next : null;

  if (next) {
    const redirectUrl = new URL(next, "http://localhost");
    redirectUrl.searchParams.set("token", session.accessToken);
    redirectUrl.searchParams.set("refresh_token", session.refreshToken);
    return res.redirect(redirectUrl.toString());
  }

  return res.json(session);
});

authRouter.post("/auth/refresh", (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
  if (!refreshToken) {
    throw new HttpError(400, "invalid_request", "refreshToken is required.");
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const identity = consumeRefreshToken(tokenHash);
  if (!identity) {
    throw new HttpError(401, "invalid_refresh_token", "Refresh token is invalid or expired.");
  }

  res.json(issueSession(identity));
});

authRouter.post("/auth/logout", (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
  if (refreshToken) {
    revokeRefreshToken(hashRefreshToken(refreshToken));
  }

  res.json({ ok: true });
});

authRouter.post("/auth/break-glass", (req, res) => {
  const suppliedSecret = typeof req.body?.secret === "string" ? req.body.secret : "";
  const email = typeof req.body?.email === "string" ? req.body.email : "system.admin@constitutionalerp.local";

  if (!suppliedSecret || suppliedSecret !== config.adminSecret) {
    throw new HttpError(401, "invalid_admin_secret", "Admin secret is invalid.");
  }

  const identity = resolveIdentity({
    externalProvider: "google",
    externalSubject: `break-glass-${randomUUID()}`,
    email,
    h2rEmployeeId: null,
    forceAdmin: true
  });

  res.json(issueSession(identity));
});

authRouter.get("/auth/introspect", (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  const claims = verifyAccessToken(token);
  const identityId = claims.identity_id;

  const identity = getIdentityById(identityId);
  if (!identity) {
    throw new HttpError(404, "identity_not_found", "Identity was not found.");
  }

  res.json({ active: true, identity, claims });
});
