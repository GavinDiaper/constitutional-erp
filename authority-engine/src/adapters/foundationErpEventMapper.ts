import { z } from "zod";
import { CanonicalEvent } from "../contracts/canonicalEvents";
import { canonicalEventSchema } from "../contracts/canonicalSchemas";

export interface FoundationEventRow {
  event_id?: string;
  eventId?: string;
  entity_id?: string;
  entityId?: string;
  event_type?: string;
  eventType?: string;
  version?: number;
  timestamp?: string;
  payload?: unknown;
}

const recordSchema = z.record(z.any());

function asObject(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    return recordSchema.parse(JSON.parse(payload));
  }

  return recordSchema.parse(payload ?? {});
}

function eventTypeOf(row: FoundationEventRow): string {
  return String(row.event_type ?? row.eventType ?? "");
}

function eventIdOf(row: FoundationEventRow): string {
  return String(row.event_id ?? row.eventId ?? "");
}

function entityIdOf(row: FoundationEventRow): string {
  return String(row.entity_id ?? row.entityId ?? "");
}

function occurredAtOf(row: FoundationEventRow): string {
  return String(row.timestamp ?? "");
}

function versionOf(row: FoundationEventRow): number {
  return Number(row.version ?? 1);
}

function parseCanonicalEvent(event: CanonicalEvent): CanonicalEvent {
  return canonicalEventSchema.parse(event) as CanonicalEvent;
}

export function mapFoundationEventToCanonical(row: FoundationEventRow): CanonicalEvent | null {
  const type = eventTypeOf(row);
  const payload = asObject(row.payload);
  const entityId = entityIdOf(row);
  const sourceEventId = eventIdOf(row);
  const occurredAt = occurredAtOf(row);
  const version = versionOf(row);

  const base = { entityId, sourceEventId, occurredAt, version };

  switch (type) {
    case "EmployeeHired":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          employeeId: entityId,
          name: String(payload.name ?? ""),
          email: payload.email ? String(payload.email) : undefined
        }
      });
    case "EmployeeTerminated":
    case "EmployeeOnLeave":
    case "EmployeeReturned":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          employeeId: entityId,
          fromStatus: payload.from ? String(payload.from) : undefined,
          toStatus: payload.to ? String(payload.to) : undefined
        }
      });
    case "PositionCreated":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          positionId: entityId,
          title: String(payload.title ?? ""),
          department: String(payload.department ?? ""),
          authorityDomain: String(payload.authorityDomain ?? "") as "O2C" | "P2P" | "R2R" | "H2R",
          authorityTier: Number(payload.authorityTier)
        }
      });
    case "AssignmentCreated":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          assignmentId: entityId,
          employeeId: String(payload.employeeId ?? ""),
          positionId: String(payload.positionId ?? "")
        }
      });
    case "AssignmentEnded":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          assignmentId: entityId,
          fromState: payload.from ? String(payload.from) : undefined,
          toState: payload.to ? String(payload.to) : undefined
        }
      });
    case "CredentialIssued":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          credentialId: entityId,
          employeeId: String(payload.employeeId ?? ""),
          credentialType: String(payload.type ?? payload.credentialType ?? ""),
          expiryDate: payload.expiryDate ? String(payload.expiryDate) : undefined
        }
      });
    case "CredentialExpired":
    case "CredentialRevoked":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          credentialId: entityId,
          fromStatus: payload.from ? String(payload.from) : undefined,
          toStatus: payload.to ? String(payload.to) : undefined
        }
      });
    case "AuthorityRuleCreated":
      return parseCanonicalEvent({
        ...base,
        type,
        payload: {
          ruleId: entityId,
          domain: String(payload.domain ?? "") as "O2C" | "P2P" | "R2R" | "H2R",
          threshold: Number(payload.threshold),
          requiredTier: Number(payload.requiredTier)
        }
      });
    default:
      return null;
  }
}
