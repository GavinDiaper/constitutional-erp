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

const SYSTEM_ACTOR: EventActor = { type: "system", id: "foundation-erp" };

export function actorContext(req: Request, _res: Response, next: NextFunction): void {
  const actorType = req.headers["x-actor-type"];
  const actorId = req.headers["x-actor-id"];
  const actorTier = req.headers["x-actor-tier"];

  if (actorType && actorId) {
    req.actor = {
      type: actorType === "user" ? "user" : "system",
      id: String(actorId),
      ...(actorTier ? { authorityTier: String(actorTier) } : {})
    };
  } else {
    req.actor = SYSTEM_ACTOR;
  }

  next();
}
