import { EventActor } from "../events/eventStore";
import { HttpError } from "../utils/errors";

export function parseActorTier(actor?: EventActor): number {
  const parsed = Number(actor?.authorityTier);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Authority is decided by the Mesh Gateway. This check only applies to direct, unsigned calls, which are
 * possible only while MESH_ASSERTION_SECRET is unset (refused at startup in production).
 */
export function requireTier(actor: EventActor | undefined, requiredTier: number, message: string): void {
  if (actor?.meshAsserted) {
    return;
  }
  if (parseActorTier(actor) < requiredTier) {
    throw new HttpError(403, "insufficient_authority", message);
  }
}
