import { CanonicalEvent } from "../contracts/canonicalEvents";
import { db } from "../db/connection";

const SOD_RELEVANT_V1_EVENTS = new Set<string>([
  "p2p_requisition_approved",
  "p2p_purchase_order_issued",
  "r2r_journal_posted",
  "r2r_fiscal_period_closed",
  "r2r_fiscal_period_locked",
  "r2r_fiscal_year_closed",
  "h2r_assignment_created",
  "h2r_assignment_ended",
  "h2r_credential_issued",
  "h2r_credential_revoked",
  "h2r_employee_terminated"
]);

function nowIso(): string {
  return new Date().toISOString();
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

function upsertCredential(event: CanonicalEvent, status: "Valid" | "Expired" | "Revoked") {
  const actorId = toOptionalString(event.payload.employeeId ?? event.payload.actorId);
  const credentialId = toOptionalString(event.payload.credentialId) ?? event.entityId;
  const credentialType = toOptionalString(event.payload.credentialType ?? event.payload.type) ?? "Unknown";
  const updatedAt = event.occurredAt || nowIso();

  if (!actorId || !credentialId) {
    return;
  }

  db.prepare(
    `INSERT INTO governance_actor_credential(
      credential_id, actor_id, credential_type, status, expiry_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      actor_id = excluded.actor_id,
      credential_type = excluded.credential_type,
      status = excluded.status,
      expiry_date = excluded.expiry_date,
      updated_at = excluded.updated_at`
  ).run(
    credentialId,
    actorId,
    credentialType,
    status,
    toOptionalString(event.payload.expiryDate) ?? null,
    updatedAt,
    updatedAt
  );
}

function insertActionHistory(event: CanonicalEvent) {
  if (!SOD_RELEVANT_V1_EVENTS.has(event.type)) {
    return;
  }

  const actorId = toOptionalString(event.payload.actorId) ?? event.entityId;
  const requesterId = toOptionalString(event.payload.requesterId ?? event.payload.initiatorId ?? event.payload.employeeId);
  const action = event.type;
  const domain = event.type.slice(0, 3).toUpperCase();

  if (!actorId || !requesterId || !action || !domain) {
    return;
  }

  db.prepare(
    `INSERT INTO governance_action_history(
      source_event_id, actor_id, requester_id, domain, action, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(event.sourceEventId, actorId, requesterId, domain, action, event.occurredAt || nowIso());
}

export function applyCanonicalEvent(event: CanonicalEvent) {
  switch (event.type) {
    case "h2r_credential_issued":
    case "CredentialIssued":
      upsertCredential(event, "Valid");
      return;
    case "h2r_credential_expired":
    case "CredentialExpired":
      upsertCredential(event, "Expired");
      return;
    case "h2r_credential_revoked":
    case "CredentialRevoked":
      upsertCredential(event, "Revoked");
      return;
    default:
      insertActionHistory(event);
  }
}
