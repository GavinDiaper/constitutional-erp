import { db } from "../db/connection";
import { newId } from "../utils/id";

export interface GovernanceEvent {
  eventId?: string;
  entityId: string;
  entityType: string;
  eventType: string;
  version: number;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
}

export interface GovernanceDecisionLogEntry {
  actorId: string;
  action: string;
  domain: string;
  decision: "Allow" | "Deny";
  requiresApproval: boolean;
  requiredApproverTier?: number;
  escalatedToTier?: number;
  riskLevel?: string;
  violations: string[];
  matchedRules: string[];
  timestamp: string;
}

export function appendGovernanceEvent(event: GovernanceEvent): string {
  const eventId = event.eventId ?? newId("GEVT-");
  db.prepare(
    `INSERT OR IGNORE INTO governance_event (
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

export function appendGovernanceDecisionLog(entry: GovernanceDecisionLogEntry): string {
  const decisionId = newId("GDEC-");

  db.prepare(
    `INSERT INTO governance_decision_log (
      decision_id,
      actor_id,
      action,
      domain,
      decision,
      requires_approval,
      required_approver_tier,
      escalated_to_tier,
      risk_level,
      violations,
      matched_rules,
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    decisionId,
    entry.actorId,
    entry.action,
    entry.domain,
    entry.decision,
    entry.requiresApproval ? 1 : 0,
    entry.requiredApproverTier ?? null,
    entry.escalatedToTier ?? null,
    entry.riskLevel ?? null,
    JSON.stringify(entry.violations),
    JSON.stringify(entry.matchedRules),
    entry.timestamp
  );

  return decisionId;
}

export function listGovernanceEvents(limit = 100, afterTimestamp?: string) {
  if (afterTimestamp) {
    return db
      .prepare(`SELECT * FROM governance_event WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?`)
      .all(afterTimestamp, limit);
  }

  return db.prepare(`SELECT * FROM governance_event ORDER BY timestamp ASC LIMIT ?`).all(limit);
}
