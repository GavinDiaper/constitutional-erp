import { createHmac } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env";

type JwtClaims = {
  iss: string;
  aud: string;
  identity_id?: string;
  email?: string;
  h2r_employee_id?: string | null;
  is_admin?: boolean;
  exp?: number;
};

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function encodeBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

function verifyToken(token: string, config: AppConfig): JwtClaims | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = encodeBase64Url(createHmac("sha256", config.jwtSigningSecret).update(unsigned).digest());
  if (expectedSignature !== signature) {
    return null;
  }

  try {
    const claims = JSON.parse(decodeBase64Url(encodedPayload)) as JwtClaims;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== config.jwtIssuer || claims.aud !== config.jwtAudience || !claims.exp || claims.exp <= now) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

// A verified token is the source of truth for identity: client-supplied actor headers are overwritten.
// With requireJwt set (production), unauthenticated /mesh requests are refused.
export function jwtActorContext(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = parseBearerToken(req.header("authorization"));
    const claims = token ? verifyToken(token, config) : null;
    const actorId = claims?.h2r_employee_id || claims?.identity_id;

    if (!claims || !actorId) {
      if (config.requireJwt && req.path.startsWith("/mesh") && req.path !== "/mesh/ready") {
        res.status(401).json({ title: "authentication_required", status: 401, detail: "A valid bearer token is required" });
        return;
      }
      next();
      return;
    }

    req.headers[config.actorIdHeader] = actorId;
    req.headers["x-identity-id"] = claims.identity_id ?? actorId;
    delete req.headers["x-actor-tier"];

    if (claims.email) {
      req.headers["x-actor-email"] = claims.email;
    }

    if (claims.h2r_employee_id) {
      req.headers["x-actor-h2r-employee-id"] = claims.h2r_employee_id;
    }

    next();
  };
}
