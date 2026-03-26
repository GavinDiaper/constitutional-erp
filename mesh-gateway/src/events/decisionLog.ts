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
