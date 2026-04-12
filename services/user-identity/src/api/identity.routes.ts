import { Router } from "express";
import { HttpError } from "../utils/errors";
import { getIdentityById, linkIdentityToH2R } from "../domain/identityRepository";
import { verifyAccessToken } from "../domain/tokenService";
import { loadConfig } from "../config/env";

const config = loadConfig();

function parseBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "invalid_token", "Authorization header is missing or malformed.");
  }

  return authorization.slice("Bearer ".length).trim();
}

export const identityRouter = Router();

identityRouter.get("/identity/me", (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  const claims = verifyAccessToken(token);
  const identity = getIdentityById(claims.identity_id);

  if (!identity) {
    throw new HttpError(404, "identity_not_found", "Identity was not found.");
  }

  res.json({
    identityId: identity.identityId,
    email: identity.email,
    provider: identity.externalProvider,
    h2rEmployeeId: identity.h2rEmployeeId,
    status: identity.status,
    isAdmin: identity.isAdmin
  });
});

identityRouter.post("/identity/link-h2r", (req, res) => {
  const adminSecret = req.header("x-admin-secret");
  if (!adminSecret || adminSecret !== config.adminSecret) {
    throw new HttpError(403, "forbidden", "Admin secret is invalid.");
  }

  const identityId = typeof req.body?.identityId === "string" ? req.body.identityId.trim() : "";
  const h2rEmployeeId = typeof req.body?.h2rEmployeeId === "string" ? req.body.h2rEmployeeId.trim() : "";

  if (!identityId || !h2rEmployeeId) {
    throw new HttpError(400, "invalid_request", "identityId and h2rEmployeeId are required.");
  }

  const updated = linkIdentityToH2R(identityId, h2rEmployeeId);
  if (!updated) {
    throw new HttpError(404, "identity_not_found", "Identity was not found.");
  }

  res.json({
    identityId: updated.identityId,
    h2rEmployeeId: updated.h2rEmployeeId,
    status: updated.status
  });
});
