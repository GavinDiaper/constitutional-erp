import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureEmployeeExists } from "../employee/employeeService";

type CredentialStatus = "Valid" | "Expired" | "Revoked";

const credentialTransitions: Record<CredentialStatus, CredentialStatus[]> = {
  Valid: ["Expired", "Revoked"],
  Expired: [],
  Revoked: []
};

function now(): string {
  return new Date().toISOString();
}

export function getCredentialById(credentialId: string) {
  const row = db.prepare("SELECT * FROM h2r_credential WHERE credential_id = ?").get(credentialId) as
    | { credential_id: string; status: CredentialStatus }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Credential not found");
  }

  return row;
}

export function listCredentials(employeeId?: string) {
  if (employeeId) {
    return db
      .prepare("SELECT * FROM h2r_credential WHERE employee_id = ? ORDER BY created_at DESC LIMIT 200")
      .all(employeeId);
  }

  return db.prepare("SELECT * FROM h2r_credential ORDER BY created_at DESC LIMIT 200").all();
}

export function issueCredential(
  input: { employeeId: string; type: string; expiryDate?: string },
  actor?: EventActor
) {
  ensureEmployeeExists(input.employeeId);

  const credentialId = newId("CRED-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_credential(credential_id, employee_id, type, status, issued_date, expiry_date, created_at, updated_at)
       VALUES (?, ?, ?, 'Valid', ?, ?, ?, ?)`
    ).run(credentialId, input.employeeId, input.type, timestamp, input.expiryDate ?? null, timestamp, timestamp);

    appendEvent({
      entityId: credentialId,
      entityType: "Credential",
      eventType: "credential.issued",
      version: 1,
      payload: input as Record<string, unknown>,
      actor
    });
  });

  return getCredentialById(credentialId);
}

function updateCredentialStatus(
  credentialId: string,
  toStatus: CredentialStatus,
  eventType: string,
  actor?: EventActor
) {
  const credential = getCredentialById(credentialId);
  if (!credentialTransitions[credential.status].includes(toStatus)) {
    throw new HttpError(
      409,
      "invalid_transition",
      `Cannot transition credential from ${credential.status} to ${toStatus}`
    );
  }

  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE h2r_credential SET status = ?, updated_at = ? WHERE credential_id = ?")
      .run(toStatus, timestamp, credentialId);

    appendEvent({
      entityId: credentialId,
      entityType: "Credential",
      eventType,
      version: 1,
      payload: { from: credential.status, to: toStatus },
      actor
    });
  });

  return getCredentialById(credentialId);
}

export function expireCredential(credentialId: string, actor?: EventActor) {
  return updateCredentialStatus(credentialId, "Expired", "credential.expired", actor);
}

export function revokeCredential(credentialId: string, actor?: EventActor) {
  return updateCredentialStatus(credentialId, "Revoked", "credential.revoked", actor);
}
