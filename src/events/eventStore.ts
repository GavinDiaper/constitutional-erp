import { db } from "../db/connection";
import { newId } from "../utils/id";
import { HttpError } from "../utils/errors";

export interface EventActor {
  type: "user" | "system";
  id: string;
  authorityTier?: string;
}

export interface DomainEvent {
  eventId?: string;
  entityId: string;
  entityType: string;
  eventType: string;
  version: number;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  actor?: EventActor;
}

export function appendEvent(event: DomainEvent): string {
  const eventId = event.eventId ?? newId("EVT-");
  try {
    db.prepare(
      `INSERT INTO event (
        event_id, entity_id, entity_type, event_type, version, timestamp, payload, correlation_id, causation_id, actor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      event.entityId,
      event.entityType,
      event.eventType,
      event.version,
      new Date().toISOString(),
      JSON.stringify(event.payload),
      event.correlationId ?? null,
      event.causationId ?? null,
      event.actor ? JSON.stringify(event.actor) : null
    );
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate_event", `Event with id '${eventId}' already exists`);
    }
    throw err;
  }

  return eventId;
}

export function listEvents(limit = 100, afterTimestamp?: string) {
  if (afterTimestamp) {
    return db
      .prepare(
        `SELECT * FROM event WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?`
      )
      .all(afterTimestamp, limit);
  }

  return db.prepare(`SELECT * FROM event ORDER BY timestamp ASC LIMIT ?`).all(limit);
}
