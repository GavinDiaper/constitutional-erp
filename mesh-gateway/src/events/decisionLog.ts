import { db } from "../db/connection";

export function logMeshEvent(input: {
  eventType: string;
  actorId: string;
  domain?: string;
  action?: string;
  resource?: string;
  decision?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}) {
  db.prepare(
    `INSERT INTO mesh_decision_log(
      event_type, actor_id, domain, action, resource, decision, reason, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.eventType,
    input.actorId,
    input.domain ?? null,
    input.action ?? null,
    input.resource ?? null,
    input.decision ?? null,
    input.reason ?? null,
    JSON.stringify(input.payload ?? {}),
    new Date().toISOString()
  );
}

function parseAfterCursor(after?: string): { createdAt?: string; id?: number } {
  if (!after) {
    return {};
  }

  const [createdAt, id] = after.split("|");
  return {
    createdAt: createdAt || undefined,
    id: id ? Number(id) : undefined
  };
}

export function listMeshEvents(limit = 100, after?: string) {
  const cursor = parseAfterCursor(after);
  if (cursor.createdAt) {
    return db
      .prepare(
        `SELECT * FROM mesh_decision_log
         WHERE created_at > ? OR (created_at = ? AND id > ?)
         ORDER BY created_at ASC, id ASC
         LIMIT ?`
      )
      .all(cursor.createdAt, cursor.createdAt, cursor.id ?? 0, limit);
  }

  return db.prepare(`SELECT * FROM mesh_decision_log ORDER BY created_at ASC, id ASC LIMIT ?`).all(limit);
}
