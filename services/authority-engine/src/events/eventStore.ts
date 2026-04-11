import { db } from "../db/connection";
import { newId } from "../utils/id";

export interface AuthorityEvent {
  eventId?: string;
  entityId: string;
  entityType: string;
  eventType: string;
  version: number;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
}

export function appendAuthorityEvent(event: AuthorityEvent): string {
  const eventId = event.eventId ?? newId("AEVT-");
  db.prepare(
    `INSERT OR IGNORE INTO authority_event (
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

export function listAuthorityEvents(limit = 100, afterTimestamp?: string) {
  if (afterTimestamp) {
    return db
      .prepare(`SELECT * FROM authority_event WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?`)
      .all(afterTimestamp, limit);
  }

  return db.prepare(`SELECT * FROM authority_event ORDER BY timestamp ASC LIMIT ?`).all(limit);
}
