import { createHash, createHmac, randomBytes } from "node:crypto";
import { loadConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import type { IdentityUser } from "./identityRepository";

const config = loadConfig();

interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  identity_id: string;
  email: string;
  provider: "google" | "microsoft" | "apple";
  h2r_employee_id: string | null;
  status: string;
  is_admin: boolean;
  iat: number;
  exp: number;
}

function encodeBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(unsignedToken: string): string {
  return encodeBase64Url(createHmac("sha256", config.jwtSigningSecret).update(unsignedToken).digest());
}

function parseJwt(token: string): { header: Record<string, unknown>; payload: AccessTokenClaims; signature: string; unsigned: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new HttpError(401, "invalid_token", "Token format is invalid.");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  let header: Record<string, unknown>;
  let payload: AccessTokenClaims;
  try {
    header = JSON.parse(decodeBase64Url(encodedHeader)) as Record<string, unknown>;
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as AccessTokenClaims;
  } catch {
    throw new HttpError(401, "invalid_token", "Token payload is invalid JSON.");
  }

  return { header, payload, signature, unsigned };
}

export function createAccessToken(identity: IdentityUser): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    iss: config.jwtIssuer,
    aud: config.jwtAudience,
    sub: identity.identityId,
    identity_id: identity.identityId,
    email: identity.email,
    provider: identity.externalProvider,
    h2r_employee_id: identity.h2rEmployeeId,
    status: identity.status,
    is_admin: identity.isAdmin,
    iat: now,
    exp: now + config.accessTokenTtlSeconds
  };

  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(unsigned);

  return `${unsigned}.${signature}`;
}

export function createRefreshToken(): { rawToken: string; tokenHash: string; expiresAt: string } {
  const rawToken = encodeBase64Url(randomBytes(48));
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000).toISOString();

  return { rawToken, tokenHash, expiresAt };
}

export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const { payload, signature, unsigned } = parseJwt(token);
  const expectedSignature = sign(unsigned);
  if (signature !== expectedSignature) {
    throw new HttpError(401, "invalid_token", "Token signature is invalid.");
  }

  if (payload.iss !== config.jwtIssuer || payload.aud !== config.jwtAudience) {
    throw new HttpError(401, "invalid_token", "Token issuer or audience is invalid.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new HttpError(401, "token_expired", "Token has expired.");
  }

  return payload;
}
