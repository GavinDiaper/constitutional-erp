import { randomUUID } from "node:crypto";
import { ApprovalTask, CanonicalDomain, CommandLogEntry } from "../contracts/canonicalTypes";
import { db, transaction } from "../db/connection";

// ── Approval Tasks ────────────────────────────────────────────────────────────

interface ApprovalTaskRow {
  id: string;
  domain: string;
  aggregate_type: string;
  aggregate_id: string;
  action: string;
  actor_id: string;
  payload_json: string;
  required_approver_tier: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

function mapTaskRow(row: ApprovalTaskRow): ApprovalTask {
  return {
    id: row.id,
    domain: row.domain as CanonicalDomain,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    action: row.action,
    actorId: row.actor_id,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    requiredApproverTier: row.required_approver_tier,
    status: row.status as ApprovalTask["status"],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolutionNote: row.resolution_note ?? undefined
  };
}

export function createApprovalTask(input: Omit<ApprovalTask, "id" | "createdAt">): ApprovalTask {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO pge_approval_task
       (id, domain, aggregate_type, aggregate_id, action, actor_id, payload_json,
        required_approver_tier, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.domain,
    input.aggregateType,
    input.aggregateId,
    input.action,
    input.actorId,
    JSON.stringify(input.payload),
    input.requiredApproverTier,
    "Pending",
    createdAt
  );

  return { ...input, id, createdAt };
}

export function getApprovalTask(id: string): ApprovalTask | undefined {
  const row = db
    .prepare("SELECT * FROM pge_approval_task WHERE id = ?")
    .get(id) as ApprovalTaskRow | undefined;

  return row ? mapTaskRow(row) : undefined;
}

export function listPendingApprovalTasks(filters?: {
  domain?: CanonicalDomain;
  aggregateType?: string;
  aggregateId?: string;
}): ApprovalTask[] {
  const clauses: string[] = ["status = 'Pending'"];
  const params: string[] = [];

  if (filters?.domain) {
    clauses.push("domain = ?");
    params.push(filters.domain);
  }
  if (filters?.aggregateType) {
    clauses.push("aggregate_type = ?");
    params.push(filters.aggregateType);
  }
  if (filters?.aggregateId) {
    clauses.push("aggregate_id = ?");
    params.push(filters.aggregateId);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const rows = db
    .prepare(`SELECT * FROM pge_approval_task ${where} ORDER BY created_at ASC`)
    .all(...params) as ApprovalTaskRow[];

  return rows.map(mapTaskRow);
}

export function resolveApprovalTask(
  id: string,
  resolution: "Approved" | "Rejected",
  resolvedBy: string,
  note?: string
): ApprovalTask | undefined {
  return transaction(() => {
    const task = getApprovalTask(id);
    if (!task || task.status !== "Pending") return undefined;

    db.prepare(
      `UPDATE pge_approval_task
       SET status = ?, resolved_at = ?, resolved_by = ?, resolution_note = ?
       WHERE id = ?`
    ).run(resolution, new Date().toISOString(), resolvedBy, note ?? null, id);

    return { ...task, status: resolution, resolvedBy, resolvedAt: new Date().toISOString() };
  });
}

// ── Command Log ───────────────────────────────────────────────────────────────

export function appendCommandLog(entry: Omit<CommandLogEntry, "id" | "createdAt">): CommandLogEntry {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO pge_command_log
       (id, domain, aggregate_type, aggregate_id, action, actor_id, projected_state,
        payload_json, mesh_delegated, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.domain,
    entry.aggregateType,
    entry.aggregateId,
    entry.action,
    entry.actorId,
    entry.projectedState,
    JSON.stringify(entry.payload),
    entry.meshDelegated ? 1 : 0,
    createdAt
  );

  return { ...entry, id, createdAt };
}
