import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type AuthorityDomain = "O2C" | "P2P" | "R2R" | "H2R";

function now(): string {
  return new Date().toISOString();
}

export function getPositionById(positionId: string) {
  const row = db.prepare("SELECT * FROM h2r_position WHERE position_id = ?").get(positionId);
  if (!row) {
    throw new HttpError(404, "not_found", "Position not found");
  }

  return row;
}

export function listPositions() {
  return db.prepare("SELECT * FROM h2r_position ORDER BY created_at DESC LIMIT 200").all();
}

export function createPosition(
  input: {
  title: string;
  department: string;
  authorityDomain: AuthorityDomain;
  authorityTier: number;
  },
  actor?: EventActor
) {
  if (!Number.isInteger(input.authorityTier) || input.authorityTier < 1 || input.authorityTier > 5) {
    throw new HttpError(400, "invalid_request", "authorityTier must be an integer between 1 and 5");
  }

  const positionId = newId("POS-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_position(position_id, title, department, authority_domain, authority_tier, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(positionId, input.title, input.department, input.authorityDomain, input.authorityTier, timestamp, timestamp);

    appendEvent({
      entityId: positionId,
      entityType: "Position",
      eventType: "position.created",
      version: 1,
      payload: input as Record<string, unknown>,
      actor
    });
  });

  return getPositionById(positionId);
}

export function ensurePositionExists(positionId: string) {
  getPositionById(positionId);
}
