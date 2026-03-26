import { randomUUID } from "node:crypto";
import { db, transaction } from "../db/connection";
import { AuthorityDomain, PendingApprovalTask } from "./types";

interface ApprovalTaskRow {
  task_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  requested_by: string;
  domain: AuthorityDomain;
  resource_id: string;
  action: string;
  required_tier: number | null;
  escalated_to_tier: number | null;
  original_request_path: string;
  original_request_body: string;
  context_json: string;
  decision_snapshot_json: string;
  request_fingerprint: string;
}

function mapTask(row: ApprovalTaskRow): PendingApprovalTask {
  return {
    taskId: row.task_id,
    status: row.status,
    requestedBy: row.requested_by,
    domain: row.domain,
    resourceId: row.resource_id,
    action: row.action,
    requiredTier: row.required_tier ?? undefined,
    escalatedToTier: row.escalated_to_tier ?? undefined,
    originalRequestPath: row.original_request_path,
    originalRequestBody: row.original_request_body,
    contextJson: row.context_json,
    decisionSnapshotJson: row.decision_snapshot_json,
    requestFingerprint: row.request_fingerprint
  };
}

export function createApprovalTask(input: {
  actorId: string;
  domain: AuthorityDomain;
  resourceId: string;
  action: string;
  requiredTier?: number;
  escalatedToTier?: number;
  requestPath: string;
  requestBody: unknown;
  context: Record<string, unknown>;
  decisionSnapshot: Record<string, unknown>;
  approvers: string[];
  requestFingerprint: string;
}): { taskId: string } {
  const now = new Date().toISOString();
  const taskId = `TASK-${randomUUID().slice(0, 8).toUpperCase()}`;

  transaction(() => {
    db.prepare(
      `INSERT INTO mesh_approval_task(
        task_id, status, requested_by, domain, resource_id, action, required_tier, escalated_to_tier,
        original_request_path, original_request_body, context_json, decision_snapshot_json,
        request_fingerprint, created_at, updated_at
      ) VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      input.actorId,
      input.domain,
      input.resourceId,
      input.action,
      input.requiredTier ?? null,
      input.escalatedToTier ?? null,
      input.requestPath,
      JSON.stringify(input.requestBody ?? {}),
      JSON.stringify(input.context),
      JSON.stringify(input.decisionSnapshot),
      input.requestFingerprint,
      now,
      now
    );

    const insertAssignment = db.prepare(
      "INSERT INTO mesh_approval_assignment(task_id, approver_id, assigned_at) VALUES (?, ?, ?)"
    );

    for (const approverId of input.approvers) {
      insertAssignment.run(taskId, approverId, now);
    }
  });

  return { taskId };
}

export function getApprovalTask(taskId: string): PendingApprovalTask | null {
  const row = db.prepare("SELECT * FROM mesh_approval_task WHERE task_id = ?").get(taskId) as ApprovalTaskRow | undefined;
  return row ? mapTask(row) : null;
}

export function listApprovalTasksForActor(actorId: string): Array<Record<string, unknown>> {
  const rows = db
    .prepare(
      `SELECT t.task_id, t.status, t.domain, t.resource_id, t.action, t.required_tier, t.escalated_to_tier,
              t.request_fingerprint, t.created_at, t.updated_at
       FROM mesh_approval_task t
       INNER JOIN mesh_approval_assignment a ON a.task_id = t.task_id
       WHERE a.approver_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(actorId) as Array<Record<string, unknown>>;

  return rows;
}

export function isActorAssigned(taskId: string, actorId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM mesh_approval_assignment WHERE task_id = ? AND approver_id = ? LIMIT 1")
    .get(taskId, actorId) as { present: number } | undefined;

  return Boolean(row?.present);
}

export function setTaskApproved(taskId: string, actorId: string) {
  db.prepare("UPDATE mesh_approval_task SET status = 'APPROVED', approved_by = ?, updated_at = ? WHERE task_id = ?")
    .run(actorId, new Date().toISOString(), taskId);
}

export function setTaskRejected(taskId: string, actorId: string, reason: string) {
  db.prepare(
    "UPDATE mesh_approval_task SET status = 'REJECTED', rejected_by = ?, rejection_reason = ?, updated_at = ? WHERE task_id = ?"
  ).run(actorId, reason, new Date().toISOString(), taskId);
}

export function setTaskExecuted(taskId: string) {
  db.prepare("UPDATE mesh_approval_task SET status = 'EXECUTED', updated_at = ? WHERE task_id = ?")
    .run(new Date().toISOString(), taskId);
}
