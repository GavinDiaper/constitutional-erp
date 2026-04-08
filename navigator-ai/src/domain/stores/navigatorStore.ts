import { randomUUID } from "node:crypto";
import { db } from "../../db/connection";
import { ApprovalRequestRecord, ApprovalRequestStatus, DecisionOutcome, ExecutionResult, RankedAction, SessionContext, SimulationResult } from "../../contracts/navigatorTypes";

export function recordLlmInteraction(input: {
  id: string;
  kind: string;
  model: string;
  promptJson: string;
  responseText: string;
  contextHash?: string;
}) {
  db.prepare(
    `INSERT INTO navigator_llm_log(id, kind, model, prompt_json, response_text, context_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.kind,
    input.model,
    input.promptJson,
    input.responseText,
    input.contextHash ?? null,
    new Date().toISOString()
  );
}

export function recordRanking(ctx: SessionContext, rankedActions: RankedAction[], chosenActionId?: string) {
  db.prepare(
    `INSERT INTO navigator_ranking_decision(
      id, domain, aggregate_type, aggregate_id, actor_id, ranked_actions_json, chosen_action_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    ctx.domain,
    ctx.aggregateType,
    ctx.aggregateId,
    ctx.actorId,
    JSON.stringify(rankedActions),
    chosenActionId ?? null,
    new Date().toISOString()
  );
}

export function recordSimulation(ctx: SessionContext, actionId: string, result: SimulationResult) {
  db.prepare(
    `INSERT INTO navigator_simulation_run(
      id, domain, aggregate_type, aggregate_id, actor_id, action_id, result_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    ctx.domain,
    ctx.aggregateType,
    ctx.aggregateId,
    ctx.actorId,
    actionId,
    JSON.stringify(result),
    new Date().toISOString()
  );
}

export function recordGovernanceOutcome(ctx: SessionContext, actionId: string | null, outcome: DecisionOutcome) {
  db.prepare(
    `INSERT INTO navigator_governance_outcome(
      id, domain, aggregate_type, aggregate_id, actor_id, action_id, outcome_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    ctx.domain,
    ctx.aggregateType,
    ctx.aggregateId,
    ctx.actorId,
    actionId,
    JSON.stringify(outcome),
    new Date().toISOString()
  );
}

export function recordExecution(ctx: SessionContext, actionId: string, result: ExecutionResult) {
  db.prepare(
    `INSERT INTO navigator_execution_trace(
      id, domain, aggregate_type, aggregate_id, actor_id, action_id, mode, http_status, response_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    ctx.domain,
    ctx.aggregateType,
    ctx.aggregateId,
    ctx.actorId,
    actionId,
    result.mode,
    result.statusCode,
    JSON.stringify(result.responseBody),
    new Date().toISOString()
  );
}

export function recordApprovalRequest(input: {
  domain: string;
  aggregateType: string;
  aggregateId: string;
  actorId: string;
  actionId: string;
  requiredTier?: number;
  reasons: string[];
  context: Record<string, unknown>;
  responseBody: Record<string, unknown>;
  status?: ApprovalRequestStatus;
}): ApprovalRequestRecord {
  const approvalRequestId = randomUUID();
  const timestamp = new Date().toISOString();
  const status = input.status ?? "PENDING";

  db.prepare(
    `INSERT INTO navigator_approval_request(
      approval_request_id, domain, aggregate_type, aggregate_id, actor_id, action_id, status,
      required_tier, reasons_json, context_json, response_json, resolved_at, resolved_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    approvalRequestId,
    input.domain,
    input.aggregateType,
    input.aggregateId,
    input.actorId,
    input.actionId,
    status,
    input.requiredTier ?? null,
    JSON.stringify(input.reasons),
    JSON.stringify(input.context),
    JSON.stringify(input.responseBody),
    null,
    null,
    timestamp,
    timestamp
  );

  return {
    approvalRequestId,
    domain: input.domain,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    actorId: input.actorId,
    actionId: input.actionId,
    status,
    requiredTier: input.requiredTier,
    reasons: input.reasons,
    context: input.context,
    responseBody: input.responseBody,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function getApprovalRequest(approvalRequestId: string): ApprovalRequestRecord | undefined {
  const row = db.prepare(
    `SELECT approval_request_id, domain, aggregate_type, aggregate_id, actor_id, action_id, status,
            required_tier, reasons_json, context_json, response_json, resolved_at, resolved_by, created_at, updated_at
     FROM navigator_approval_request
     WHERE approval_request_id = ?`
  ).get(approvalRequestId) as
    | {
        approval_request_id: string;
        domain: string;
        aggregate_type: string;
        aggregate_id: string;
        actor_id: string;
        action_id: string;
        status: ApprovalRequestStatus;
        required_tier: number | null;
        reasons_json: string;
        context_json: string;
        response_json: string;
        resolved_at: string | null;
        resolved_by: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  return {
    approvalRequestId: row.approval_request_id,
    domain: row.domain,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    actorId: row.actor_id,
    actionId: row.action_id,
    status: row.status,
    requiredTier: row.required_tier ?? undefined,
    reasons: JSON.parse(row.reasons_json) as string[],
    context: JSON.parse(row.context_json) as Record<string, unknown>,
    responseBody: JSON.parse(row.response_json) as Record<string, unknown>,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listApprovalRequests(input: {
  domain: string;
  aggregateType: string;
  aggregateId: string;
  status?: ApprovalRequestStatus;
  limit?: number;
}): ApprovalRequestRecord[] {
  const limit = input.limit ?? 100;
  const rows = input.status
    ? db.prepare(
        `SELECT approval_request_id, domain, aggregate_type, aggregate_id, actor_id, action_id, status,
                required_tier, reasons_json, context_json, response_json, resolved_at, resolved_by, created_at, updated_at
         FROM navigator_approval_request
         WHERE domain = ? AND aggregate_type = ? AND aggregate_id = ? AND status = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(input.domain, input.aggregateType, input.aggregateId, input.status, limit)
    : db.prepare(
        `SELECT approval_request_id, domain, aggregate_type, aggregate_id, actor_id, action_id, status,
                required_tier, reasons_json, context_json, response_json, resolved_at, resolved_by, created_at, updated_at
         FROM navigator_approval_request
         WHERE domain = ? AND aggregate_type = ? AND aggregate_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(input.domain, input.aggregateType, input.aggregateId, limit);

  return rows.map((entry) => {
    const row = entry as {
      approval_request_id: string;
      domain: string;
      aggregate_type: string;
      aggregate_id: string;
      actor_id: string;
      action_id: string;
      status: ApprovalRequestStatus;
      required_tier: number | null;
      reasons_json: string;
      context_json: string;
      response_json: string;
      resolved_at: string | null;
      resolved_by: string | null;
      created_at: string;
      updated_at: string;
    };

    return {
      approvalRequestId: row.approval_request_id,
      domain: row.domain,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      actorId: row.actor_id,
      actionId: row.action_id,
      status: row.status,
      requiredTier: row.required_tier ?? undefined,
      reasons: JSON.parse(row.reasons_json) as string[],
      context: JSON.parse(row.context_json) as Record<string, unknown>,
      responseBody: JSON.parse(row.response_json) as Record<string, unknown>,
      resolvedAt: row.resolved_at ?? undefined,
      resolvedBy: row.resolved_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    } satisfies ApprovalRequestRecord;
  });
}

export function recordTranscript(actorId: string | undefined, commandText: string, outputText: string) {
  db.prepare(
    `INSERT INTO navigator_repl_transcript(actor_id, command_text, output_text, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(actorId ?? null, commandText, outputText, new Date().toISOString());
}

export function recordNavigatorEvent(input: {
  eventType: string;
  domain: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string;
  payload: Record<string, unknown>;
}) {
  db.prepare(
    `INSERT INTO navigator_event_log(id, event_type, domain, aggregate_type, aggregate_id, actor_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    input.eventType,
    input.domain,
    input.aggregateType,
    input.aggregateId,
    input.actorId ?? null,
    JSON.stringify(input.payload),
    new Date().toISOString()
  );
}

export function listNavigatorEvents(domain: string, aggregateType: string, aggregateId: string, limit = 100) {
  return db
    .prepare(
      `SELECT event_type, domain, aggregate_type, aggregate_id, actor_id, payload_json, created_at
       FROM navigator_event_log
       WHERE domain = ? AND aggregate_type = ? AND aggregate_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(domain, aggregateType, aggregateId, limit)
    .map((row) => {
      const typedRow = row as {
        event_type: string;
        domain: string;
        aggregate_type: string;
        aggregate_id: string;
        actor_id: string | null;
        payload_json: string;
        created_at: string;
      };

      return {
        eventType: typedRow.event_type,
        domain: typedRow.domain,
        aggregateType: typedRow.aggregate_type,
        aggregateId: typedRow.aggregate_id,
        actorId: typedRow.actor_id,
        payload: JSON.parse(typedRow.payload_json) as Record<string, unknown>,
        createdAt: typedRow.created_at
      };
    });
}
