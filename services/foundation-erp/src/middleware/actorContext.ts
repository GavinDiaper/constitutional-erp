import { NextFunction, Request, Response } from "express";
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

export function actorContext(req: Request, _res: Response, next: NextFunction): void {
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
