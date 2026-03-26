import { CanonicalEvent } from "../contracts/canonicalEvents";
import { db } from "../db/connection";
import { appendAuthorityEvent } from "../events/eventStore";
import { HttpError } from "../utils/errors";

function nowIso(): string {
  return new Date().toISOString();
}

function requireSubject(employeeId: string) {
  const row = db.prepare("SELECT employee_id FROM authority_subject WHERE employee_id = ?").get(employeeId);
  if (!row) {
    throw new HttpError(409, "invalid_replay_state", `Missing authority_subject for employee ${employeeId}`);
  }
}

export function applyCanonicalEvent(event: CanonicalEvent) {
  const now = nowIso();

  switch (event.type) {
    case "EmployeeHired": {
      db.prepare(
        `INSERT INTO authority_subject(employee_id, name, email, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Active', ?, ?)
         ON CONFLICT(employee_id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           status = 'Active',
           updated_at = excluded.updated_at`
      ).run(event.payload.employeeId, event.payload.name, event.payload.email ?? null, event.occurredAt || now, now);
      return;
    }

    case "EmployeeTerminated":
    case "EmployeeOnLeave":
    case "EmployeeReturned": {
      const targetStatus =
        event.type === "EmployeeTerminated" ? "Terminated" : event.type === "EmployeeOnLeave" ? "OnLeave" : "Active";
      requireSubject(event.payload.employeeId);
      db.prepare("UPDATE authority_subject SET status = ?, updated_at = ? WHERE employee_id = ?").run(
        targetStatus,
        now,
        event.payload.employeeId
      );
      return;
    }

    case "PositionCreated": {
      db.prepare(
        `INSERT INTO position_def(position_id, title, department, authority_domain, authority_tier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(position_id) DO UPDATE SET
           title = excluded.title,
           department = excluded.department,
           authority_domain = excluded.authority_domain,
           authority_tier = excluded.authority_tier,
           updated_at = excluded.updated_at`
      ).run(
        event.payload.positionId,
        event.payload.title,
        event.payload.department,
        event.payload.authorityDomain,
        event.payload.authorityTier,
        event.occurredAt || now,
        now
      );
      return;
    }

    case "AssignmentCreated": {
      requireSubject(event.payload.employeeId);

      const position = db
        .prepare("SELECT authority_domain, authority_tier FROM position_def WHERE position_id = ?")
        .get(event.payload.positionId) as { authority_domain: string; authority_tier: number } | undefined;

      if (!position) {
        throw new HttpError(409, "invalid_replay_state", `Missing position_def for position ${event.payload.positionId}`);
      }

      const hadActiveDomainGrant = db
        .prepare(
          `SELECT 1 FROM authority_position
           WHERE employee_id = ? AND authority_domain = ? AND active = 1
           LIMIT 1`
        )
        .get(event.payload.employeeId, position.authority_domain);

      db.prepare(
        `INSERT INTO authority_position(
           assignment_id, employee_id, position_id, authority_domain, authority_tier, active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(assignment_id) DO UPDATE SET
           employee_id = excluded.employee_id,
           position_id = excluded.position_id,
           authority_domain = excluded.authority_domain,
           authority_tier = excluded.authority_tier,
           active = 1,
           updated_at = excluded.updated_at`
      ).run(
        event.payload.assignmentId,
        event.payload.employeeId,
        event.payload.positionId,
        position.authority_domain,
        position.authority_tier,
        event.occurredAt || now,
        now
      );

      if (!hadActiveDomainGrant) {
        appendAuthorityEvent({
          entityId: event.payload.employeeId,
          entityType: "Authority",
          eventType: "AuthorityGranted",
          version: 1,
          payload: {
            domain: position.authority_domain,
            tier: position.authority_tier
          },
          correlationId: event.sourceEventId
        });
      }
      return;
    }

    case "AssignmentEnded": {
      const assignment = db
        .prepare(
          `SELECT employee_id, authority_domain, active
           FROM authority_position
           WHERE assignment_id = ?`
        )
        .get(event.payload.assignmentId) as { employee_id: string; authority_domain: string; active: number } | undefined;

      if (!assignment) {
        throw new HttpError(409, "invalid_replay_state", `Missing authority_position for assignment ${event.payload.assignmentId}`);
      }

      db.prepare("UPDATE authority_position SET active = 0, updated_at = ? WHERE assignment_id = ?").run(
        now,
        event.payload.assignmentId
      );

      const hasRemainingActiveGrant = db
        .prepare(
          `SELECT 1 FROM authority_position
           WHERE employee_id = ? AND authority_domain = ? AND active = 1
           LIMIT 1`
        )
        .get(assignment.employee_id, assignment.authority_domain);

      if (!hasRemainingActiveGrant) {
        appendAuthorityEvent({
          entityId: assignment.employee_id,
          entityType: "Authority",
          eventType: "AuthorityRevoked",
          version: 1,
          payload: {
            domain: assignment.authority_domain
          },
          correlationId: event.sourceEventId
        });
      }
      return;
    }

    case "CredentialIssued": {
      requireSubject(event.payload.employeeId);
      db.prepare(
        `INSERT INTO authority_credential(credential_id, employee_id, credential_type, status, expiry_date, created_at, updated_at)
         VALUES (?, ?, ?, 'Valid', ?, ?, ?)
         ON CONFLICT(credential_id) DO UPDATE SET
           employee_id = excluded.employee_id,
           credential_type = excluded.credential_type,
           status = 'Valid',
           expiry_date = excluded.expiry_date,
           updated_at = excluded.updated_at`
      ).run(
        event.payload.credentialId,
        event.payload.employeeId,
        event.payload.credentialType,
        event.payload.expiryDate ?? null,
        event.occurredAt || now,
        now
      );
      return;
    }

    case "CredentialExpired":
    case "CredentialRevoked": {
      const nextStatus = event.type === "CredentialExpired" ? "Expired" : "Revoked";
      const credential = db.prepare("SELECT credential_id FROM authority_credential WHERE credential_id = ?").get(
        event.payload.credentialId
      );
      if (!credential) {
        throw new HttpError(409, "invalid_replay_state", `Missing credential ${event.payload.credentialId}`);
      }

      db.prepare("UPDATE authority_credential SET status = ?, updated_at = ? WHERE credential_id = ?").run(
        nextStatus,
        now,
        event.payload.credentialId
      );

      appendAuthorityEvent({
        entityId: event.payload.credentialId,
        entityType: "Credential",
        eventType: event.type,
        version: 1,
        payload: {
          status: nextStatus
        },
        correlationId: event.sourceEventId
      });
      return;
    }

    case "AuthorityRuleCreated": {
      db.prepare(
        `INSERT INTO authority_rule(rule_id, domain, threshold, required_tier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(rule_id) DO UPDATE SET
           domain = excluded.domain,
           threshold = excluded.threshold,
           required_tier = excluded.required_tier,
           updated_at = excluded.updated_at`
      ).run(
        event.payload.ruleId,
        event.payload.domain,
        event.payload.threshold,
        event.payload.requiredTier,
        event.occurredAt || now,
        now
      );
      return;
    }
  }
}
