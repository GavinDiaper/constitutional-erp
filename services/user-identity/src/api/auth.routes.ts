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

function encodeState(input: { nonce: string; next: string | null }): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function decodeState(rawState: unknown): { nonce: string; next: string | null } {
  if (typeof rawState !== "string" || !rawState.trim()) {
    return { nonce: "", next: null };
  }

  try {
    const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8")) as {
      nonce?: unknown;
      next?: unknown;
    };

    return {
      nonce: typeof parsed.nonce === "string" ? parsed.nonce : "",
      next: typeof parsed.next === "string" && parsed.next.trim() ? parsed.next.trim() : null
    };
  } catch {
    return { nonce: "", next: null };
  }
}

function parseJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    throw new HttpError(400, "invalid_token", "Token payload is malformed.");
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_token", "Token payload could not be decoded.");
  }
}

async function exchangeAuthorizationCode(provider: ProviderName, code: string): Promise<{ accessToken?: string; idToken?: string }> {
  const providerConfig = config.providers[provider];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: providerConfig.clientId,
    client_secret: providerConfig.clientSecret,
    redirect_uri: providerConfig.redirectUri
  });

  const response = await fetch(providerConfig.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, "provider_token_exchange_failed", `Token exchange failed (${response.status}): ${detail || "no response body"}`);
  }

  const payload = (await response.json()) as { access_token?: unknown; id_token?: unknown };
  return {
    accessToken: typeof payload.access_token === "string" ? payload.access_token : undefined,
    idToken: typeof payload.id_token === "string" ? payload.id_token : undefined
  };
}

async function fetchUserInfo(provider: ProviderName, accessToken: string): Promise<Record<string, unknown>> {
  const providerConfig = config.providers[provider];
  if (!providerConfig.userInfoUrl) {
    return {};
  }

  const response = await fetch(providerConfig.userInfoUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, "provider_userinfo_failed", `User info request failed (${response.status}): ${detail || "no response body"}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function extractIdentityClaims(input: { userInfo: Record<string, unknown>; idToken?: string }): { email: string; subject: string } {
  const payload = input.idToken ? parseJwtPayload(input.idToken) : {};

  const subjectCandidate = input.userInfo.sub ?? payload.sub;
  const emailCandidate = input.userInfo.email ?? payload.email;

  const subject = typeof subjectCandidate === "string" ? subjectCandidate.trim() : "";
  const email = typeof emailCandidate === "string" ? emailCandidate.trim().toLowerCase() : "";

  if (!subject || !email) {
    throw new HttpError(400, "invalid_provider_identity", "Provider response did not include required sub/email claims.");
  }

  return { email, subject };
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
  const nonce = randomUUID();
  const next = typeof req.query.next === "string" && req.query.next.trim() ? req.query.next.trim() : null;
  const state = encodeState({ nonce, next });

  if (!providerEnabled(provider) && !config.oauthMockEnabled) {
    throw new HttpError(400, "provider_not_configured", `${provider} OAuth provider is not configured.`);
  }

  if (config.oauthMockEnabled) {
    const callbackUrl = new URL(config.providers[provider].redirectUri);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("nonce", nonce);
    callbackUrl.searchParams.set("email", String(req.query.email ?? `demo.${provider}@constitutionalerp.local`));
    callbackUrl.searchParams.set("sub", String(req.query.sub ?? `${provider}-${randomUUID()}`));

    if (next) {
      callbackUrl.searchParams.set("next", next);
    }

    return res.redirect(callbackUrl.toString());
  }

  const authorizationUrl = new URL(config.providers[provider].authorizationUrl);
  authorizationUrl.searchParams.set("client_id", config.providers[provider].clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.providers[provider].redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", config.providers[provider].scopes);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);

  return res.redirect(authorizationUrl.toString());
});

authRouter.get("/auth/callback/:provider", async (req, res) => {
  const provider = asProvider(req.params.provider);
  const state = decodeState(req.query.state);
  const nextFromQuery = typeof req.query.next === "string" && req.query.next.trim() ? req.query.next.trim() : null;
  const next = nextFromQuery ?? state.next;

  let email = typeof req.query.email === "string" ? req.query.email : "";
  let subject = typeof req.query.sub === "string" ? req.query.sub : "";

  if (!config.oauthMockEnabled) {
    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    if (!code) {
      throw new HttpError(400, "invalid_callback_payload", "Callback must include authorization code.");
    }

    const tokenResponse = await exchangeAuthorizationCode(provider, code);
    const userInfo = tokenResponse.accessToken ? await fetchUserInfo(provider, tokenResponse.accessToken) : {};
    const claims = extractIdentityClaims({ userInfo, idToken: tokenResponse.idToken });
    email = claims.email;
    subject = claims.subject;
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
