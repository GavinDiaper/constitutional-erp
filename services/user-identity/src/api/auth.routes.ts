import { createPublicKey, createVerify, randomUUID } from "node:crypto";
import { Router } from "express";
import { loadConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import { consumeRefreshToken, getIdentityById, issueRefreshToken, resolveIdentity, revokeRefreshToken } from "../domain/identityRepository";
import { createAccessToken, createRefreshToken, hashRefreshToken, verifyAccessToken } from "../domain/tokenService";

const config = loadConfig();

type ProviderName = "google" | "microsoft" | "apple";

type OidcTokenClaims = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  nonce?: unknown;
  exp?: unknown;
};

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map<string, { expiresAt: number; keys: Array<Record<string, unknown>> }>();

function asProvider(value: string): ProviderName {
  if (value === "google" || value === "microsoft" || value === "apple") {
    return value;
  }

  throw new HttpError(404, "provider_not_supported", "Provider is not supported.");
}

function providerEnabled(provider: ProviderName): boolean {
  const providerConfig = config.providers[provider];
  return Boolean(
    providerConfig.clientId &&
      providerConfig.clientSecret &&
      providerConfig.redirectUri &&
      providerConfig.authorizationUrl &&
      providerConfig.tokenUrl &&
      providerConfig.jwksUrl
  );
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

function decodeBase64UrlJson(value: string, field: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_token", `Token ${field} could not be decoded.`);
  }
}

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: Buffer;
  unsignedInput: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new HttpError(400, "invalid_token", "Token is malformed.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  return {
    header: decodeBase64UrlJson(encodedHeader, "header"),
    payload: decodeBase64UrlJson(encodedPayload, "payload"),
    signature: Buffer.from(encodedSignature, "base64url"),
    unsignedInput: `${encodedHeader}.${encodedPayload}`
  };
}

async function getJwksKeys(provider: ProviderName): Promise<Array<Record<string, unknown>>> {
  const providerConfig = config.providers[provider];
  const now = Date.now();
  const cached = jwksCache.get(providerConfig.jwksUrl);
  if (cached && cached.expiresAt > now) {
    return cached.keys;
  }

  const response = await fetch(providerConfig.jwksUrl, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, "provider_jwks_failed", `JWKS request failed (${response.status}): ${detail || "no response body"}`);
  }

  const payload = (await response.json()) as { keys?: unknown };
  if (!Array.isArray(payload.keys)) {
    throw new HttpError(502, "provider_jwks_invalid", "JWKS response did not include a valid keys array.");
  }

  const keys = payload.keys.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  jwksCache.set(providerConfig.jwksUrl, {
    expiresAt: now + JWKS_CACHE_TTL_MS,
    keys
  });

  return keys;
}

function validateIssuer(provider: ProviderName, issuer: string): void {
  const providerConfig = config.providers[provider];
  if (providerConfig.expectedIssuer && issuer === providerConfig.expectedIssuer) {
    return;
  }

  if (providerConfig.expectedIssuerPrefix && issuer.startsWith(providerConfig.expectedIssuerPrefix)) {
    return;
  }

  throw new HttpError(401, "invalid_id_token_issuer", `ID token issuer '${issuer}' is not allowed for ${provider}.`);
}

function validateAudience(provider: ProviderName, audience: unknown): void {
  const clientId = config.providers[provider].clientId;
  const audValues = Array.isArray(audience)
    ? audience.filter((value): value is string => typeof value === "string")
    : typeof audience === "string"
      ? [audience]
      : [];

  if (!audValues.includes(clientId)) {
    throw new HttpError(401, "invalid_id_token_audience", `ID token audience did not include client_id for ${provider}.`);
  }
}

async function verifyIdToken(provider: ProviderName, idToken: string, expectedNonce: string): Promise<OidcTokenClaims> {
  const parsed = parseJwt(idToken);
  const alg = typeof parsed.header.alg === "string" ? parsed.header.alg : "";
  const kid = typeof parsed.header.kid === "string" ? parsed.header.kid : "";
  if (alg !== "RS256" || !kid) {
    throw new HttpError(401, "invalid_id_token_header", "ID token header must include kid and use RS256.");
  }

  const keys = await getJwksKeys(provider);
  const jwk = keys.find((key) => key.kid === kid && key.kty === "RSA");
  if (!jwk) {
    throw new HttpError(401, "invalid_id_token_key", "No matching JWKS key found for ID token kid.");
  }

  const publicKey = createPublicKey({ key: jwk, format: "jwk" } as any);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(parsed.unsignedInput);
  verifier.end();
  if (!verifier.verify(publicKey, parsed.signature)) {
    throw new HttpError(401, "invalid_id_token_signature", "ID token signature verification failed.");
  }

  const claims = parsed.payload as OidcTokenClaims;
  const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const issuer = typeof claims.iss === "string" ? claims.iss.trim() : "";
  const nonce = typeof claims.nonce === "string" ? claims.nonce.trim() : "";
  const exp = typeof claims.exp === "number" ? claims.exp : Number(claims.exp);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!subject || !issuer || !Number.isFinite(exp) || exp <= nowSeconds) {
    throw new HttpError(401, "invalid_id_token_claims", "ID token required claims are invalid or expired.");
  }

  validateIssuer(provider, issuer);
  validateAudience(provider, claims.aud);

  if (!expectedNonce || nonce !== expectedNonce) {
    throw new HttpError(401, "invalid_id_token_nonce", "ID token nonce did not match expected value.");
  }

  return claims;
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

function extractIdentityClaims(input: { userInfo: Record<string, unknown>; idTokenClaims: OidcTokenClaims }): { email: string; subject: string } {
  const subjectCandidate = input.idTokenClaims.sub ?? input.userInfo.sub;
  const emailCandidate = input.idTokenClaims.email ?? input.userInfo.email;

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

async function resolveH2rEmployeeIdByEmail(email: string): Promise<string | null> {
  if (!config.h2rAutoLinkEnabled) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.h2rLookupTimeoutMs);

  try {
    const queryUrl = new URL(`query/h2r_employee`, `${config.foundationErpUrl.replace(/\/$/, "")}/`);
    queryUrl.searchParams.set("limit", "500");
    queryUrl.searchParams.set("offset", "0");

    const response = await fetch(queryUrl.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": config.foundationErpApiKey,
        "x-ingress-id": config.foundationErpIngressId
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) {
      return null;
    }

    const row = payload.data.find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const record = item as Record<string, unknown>;
      const candidateEmail = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
      return candidateEmail === normalizedEmail;
    }) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return typeof row.employee_id === "string" && row.employee_id.trim() ? row.employee_id.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
  const providerError = typeof req.query.error === "string" ? req.query.error.trim() : "";
  if (providerError) {
    const description = typeof req.query.error_description === "string" ? req.query.error_description.trim() : providerError;
    throw new HttpError(401, "provider_authorization_failed", description || "Provider authorization failed.");
  }

  const state = decodeState(req.query.state);
  const nextFromQuery = typeof req.query.next === "string" && req.query.next.trim() ? req.query.next.trim() : null;
  const next = nextFromQuery ?? state.next;

  let email = typeof req.query.email === "string" ? req.query.email : "";
  let subject = typeof req.query.sub === "string" ? req.query.sub : "";

  if (!config.oauthMockEnabled) {
    if (!state.nonce) {
      throw new HttpError(400, "invalid_state", "Callback state was missing or invalid.");
    }

    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    if (!code) {
      throw new HttpError(400, "invalid_callback_payload", "Callback must include authorization code.");
    }

    const tokenResponse = await exchangeAuthorizationCode(provider, code);
    if (!tokenResponse.idToken) {
      throw new HttpError(502, "provider_id_token_missing", "Provider token response did not include an id_token.");
    }

    const idTokenClaims = await verifyIdToken(provider, tokenResponse.idToken, state.nonce);
    const userInfo = tokenResponse.accessToken ? await fetchUserInfo(provider, tokenResponse.accessToken) : {};
    const claims = extractIdentityClaims({ userInfo, idTokenClaims });
    email = claims.email;
    subject = claims.subject;
  }

  if (!email || !subject) {
    throw new HttpError(400, "invalid_callback_payload", "Callback must include email and sub in mock mode.");
  }

  const h2rEmployeeId = await resolveH2rEmployeeIdByEmail(email);

  const identity = resolveIdentity({
    externalProvider: provider,
    externalSubject: subject,
    email,
    h2rEmployeeId
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
