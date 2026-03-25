import { db } from "../db/connection";
import { newId } from "../utils/id";

export interface DomainEvent {
  eventId?: string;
  entityId: string;
  entityType: string;
  eventType: string;
  version: number;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
}

export function appendEvent(event: DomainEvent): string {
  const eventId = event.eventId ?? newId("EVT-");
  db.prepare(
    `INSERT INTO event (
      event_id, entity_id, entity_type, event_type, version, timestamp, payload, correlation_id, causation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    event.entityId,
    event.entityType,
    event.eventType,
    event.version,
    new Date().toISOString(),
    JSON.stringify(event.payload),
    event.correlationId ?? null,
    event.causationId ?? null
  );

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
