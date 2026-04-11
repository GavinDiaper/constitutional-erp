import { Request } from "express";
import { HttpError } from "../utils/errors";

export function requireActorId(req: Request, actorHeader: string): string {
  const value = req.header(actorHeader)?.trim();
  if (!value) {
    throw new HttpError(400, "missing_actor", `Missing required actor header: ${actorHeader}`);
  }

  return value;
}
