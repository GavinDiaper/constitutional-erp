import { createHmac, timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { EventActor } from "../events/eventStore";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: EventActor;
    }
  }
}

const SYSTEM_ACTOR: EventActor = { type: "system", id: "foundation-erp", authorityTier: "5" };

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

const ASSERTION_MAX_AGE_MS = 5 * 60 * 1000;

// Writes to these resources must arrive via the Mesh Gateway once MESH_ASSERTION_SECRET is configured.
const MESH_GOVERNED_PREFIXES = [
  "/api/v1/o2c/contracts",
  "/api/v1/projects",
  "/api/v1/mcp/invoke",
  "/api/v1/inv/movements",
  "/api/v1/h2r/vendor-rates",
  "/api/v1/h2r/employee-cost-rates",
  "/api/v1/h2r/authority-rules",
  "/api/v1/timesheets/imports"
];

function verifyMeshAssertion(req: Request, secret: string): EventActor | null {
  const sig = firstHeaderValue(req.headers["x-mesh-actor-sig"])?.trim();
  const ts = firstHeaderValue(req.headers["x-mesh-actor-ts"])?.trim();
  const id = firstHeaderValue(req.headers["x-actor-id"])?.trim();
  const tier = firstHeaderValue(req.headers["x-actor-tier"])?.trim();
  if (!sig || !ts || !id || !tier) {
    return null;
  }

  const age = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(age) || age > ASSERTION_MAX_AGE_MS) {
    return null;
  }

  const governanceHeader = firstHeaderValue(req.headers["x-mesh-governance"])?.trim() ?? "";
  const expected = createHmac("sha256", secret).update(`${id}|${tier}|${ts}|${governanceHeader}`).digest();
  const provided = Buffer.from(sig, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let meshGovernance: Record<string, unknown> | undefined;
  if (governanceHeader) {
    try {
      meshGovernance = JSON.parse(Buffer.from(governanceHeader, "base64url").toString("utf8"));
    } catch {
      meshGovernance = undefined;
    }
  }

  return { type: id === "principal.system" ? "system" : "user", id, authorityTier: tier, meshAsserted: true, meshGovernance };
}

export function actorContext(req: Request, _res: Response, next: NextFunction): void {
  const secret = process.env.MESH_ASSERTION_SECRET?.trim();
  if (secret) {
    const asserted = verifyMeshAssertion(req, secret);
    if (asserted) {
      req.actor = asserted;
      next();
      return;
    }

    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    const governed = MESH_GOVERNED_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix));
    if (isWrite && governed) {
      next(new HttpError(401, "mesh_assertion_required", "This operation must be performed through the Mesh Gateway"));
      return;
    }
  }

  const actorType = firstHeaderValue(req.headers["x-actor-type"]);
  const actorId = firstHeaderValue(req.headers["x-actor-id"]);
  const actorTier = firstHeaderValue(req.headers["x-actor-tier"]);

  const normalizedActorId = actorId?.trim();

  if (normalizedActorId) {
    const normalizedActorType =
      actorType === "user" || actorType === "system"
        ? actorType
        : normalizedActorId === "principal.system"
          ? "system"
          : "user";

    req.actor = {
      type: normalizedActorType,
      id: normalizedActorId,
      ...(actorTier?.trim()
        ? { authorityTier: actorTier.trim() }
        : normalizedActorType === "system"
          ? { authorityTier: "5" }
          : {})
    };
  } else {
    req.actor = SYSTEM_ACTOR;
  }

  next();
}
