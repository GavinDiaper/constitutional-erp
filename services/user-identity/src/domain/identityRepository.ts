import { randomUUID } from "node:crypto";
import { db } from "../db/connection";

export type IdentityStatus = "active" | "disabled" | "limited";

export interface IdentityUser {
  identityId: string;
  externalSubject: string;
  externalProvider: "google" | "microsoft" | "apple";
  email: string;
  h2rEmployeeId: string | null;
  status: IdentityStatus;
  createdAt: string;
  lastLoginAt: string;
  isAdmin: boolean;
}

interface IdentityRow {
  identity_id: string;
  external_subject: string;
  external_provider: "google" | "microsoft" | "apple";
  email: string;
  h2r_employee_id: string | null;
  status: IdentityStatus;
  created_at: string;
  last_login_at: string;
  is_admin: number;
}

function toIdentity(row: IdentityRow): IdentityUser {
  return {
    identityId: row.identity_id,
    externalSubject: row.external_subject,
    externalProvider: row.external_provider,
    email: row.email,
    h2rEmployeeId: row.h2r_employee_id,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    isAdmin: Boolean(row.is_admin)
  };
}

export function getIdentityById(identityId: string): IdentityUser | null {
  const row = db
    .prepare(
      `SELECT identity_id, external_subject, external_provider, email, h2r_employee_id, status, created_at, last_login_at, is_admin
       FROM identity_user
       WHERE identity_id = ?`
    )
    .get(identityId) as IdentityRow | undefined;

  return row ? toIdentity(row) : null;
}

export function resolveIdentity(input: {
  externalProvider: "google" | "microsoft" | "apple";
  externalSubject: string;
  email: string;
  h2rEmployeeId?: string | null;
  forceAdmin?: boolean;
}): IdentityUser {
  const now = new Date().toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();

  const byProvider = db
    .prepare(
      `SELECT identity_id, external_subject, external_provider, email, h2r_employee_id, status, created_at, last_login_at, is_admin
       FROM identity_user
       WHERE external_provider = ? AND external_subject = ?`
    )
    .get(input.externalProvider, input.externalSubject) as IdentityRow | undefined;

  if (byProvider) {
    db.prepare(
      `UPDATE identity_user
       SET email = ?,
           h2r_employee_id = COALESCE(?, h2r_employee_id),
           status = CASE WHEN COALESCE(?, h2r_employee_id) IS NULL THEN 'limited' ELSE 'active' END,
           last_login_at = ?,
           is_admin = CASE WHEN ? = 1 THEN 1 ELSE is_admin END
       WHERE identity_id = ?`
    ).run(normalizedEmail, input.h2rEmployeeId ?? null, input.h2rEmployeeId ?? null, now, input.forceAdmin ? 1 : 0, byProvider.identity_id);

    return getIdentityById(byProvider.identity_id) as IdentityUser;
  }

  const byEmail = db
    .prepare(
      `SELECT identity_id, external_subject, external_provider, email, h2r_employee_id, status, created_at, last_login_at, is_admin
       FROM identity_user
       WHERE email = ?`
    )
    .get(normalizedEmail) as IdentityRow | undefined;

  if (byEmail) {
    db.prepare(
      `UPDATE identity_user
       SET external_provider = ?,
           external_subject = ?,
           h2r_employee_id = COALESCE(?, h2r_employee_id),
           status = CASE WHEN COALESCE(?, h2r_employee_id) IS NULL THEN 'limited' ELSE 'active' END,
           last_login_at = ?,
           is_admin = CASE WHEN ? = 1 THEN 1 ELSE is_admin END
       WHERE identity_id = ?`
    ).run(
      input.externalProvider,
      input.externalSubject,
      input.h2rEmployeeId ?? null,
      input.h2rEmployeeId ?? null,
      now,
      input.forceAdmin ? 1 : 0,
      byEmail.identity_id
    );

    return getIdentityById(byEmail.identity_id) as IdentityUser;
  }

  const identityId = randomUUID();
  db.prepare(
    `INSERT INTO identity_user (
      identity_id,
      external_subject,
      external_provider,
      email,
      h2r_employee_id,
      status,
      created_at,
      last_login_at,
      is_admin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    identityId,
    input.externalSubject,
    input.externalProvider,
    normalizedEmail,
    input.h2rEmployeeId ?? null,
    input.h2rEmployeeId ? "active" : "limited",
    now,
    now,
    input.forceAdmin ? 1 : 0
  );

  return getIdentityById(identityId) as IdentityUser;
}

export function linkIdentityToH2R(identityId: string, h2rEmployeeId: string): IdentityUser | null {
  const result = db.prepare(
    `UPDATE identity_user
     SET h2r_employee_id = ?,
         status = 'active'
     WHERE identity_id = ?`
  ).run(h2rEmployeeId, identityId);

  if (result.changes === 0) {
    return null;
  }

  return getIdentityById(identityId);
}

export function issueRefreshToken(identityId: string, tokenHash: string, expiresAt: string): string {
  const refreshTokenId = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO refresh_token (refresh_token_id, identity_id, token_hash, expires_at, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(refreshTokenId, identityId, tokenHash, expiresAt, createdAt);

  return refreshTokenId;
}

export function revokeRefreshToken(tokenHash: string): void {
  db.prepare(
    `UPDATE refresh_token
     SET revoked_at = ?
     WHERE token_hash = ? AND revoked_at IS NULL`
  ).run(new Date().toISOString(), tokenHash);
}

export function consumeRefreshToken(tokenHash: string): IdentityUser | null {
  const row = db
    .prepare(
      `SELECT t.identity_id
       FROM refresh_token t
       WHERE t.token_hash = ?
         AND t.revoked_at IS NULL
         AND t.expires_at > ?`
    )
    .get(tokenHash, new Date().toISOString()) as { identity_id: string } | undefined;

  if (!row) {
    return null;
  }

  revokeRefreshToken(tokenHash);
  return getIdentityById(row.identity_id);
}
