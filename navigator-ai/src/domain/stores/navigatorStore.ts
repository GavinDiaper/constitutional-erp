import { randomUUID } from "node:crypto";
import { db } from "../../db/connection";
import { DecisionOutcome, ExecutionResult, RankedAction, SessionContext, SimulationResult } from "../../contracts/navigatorTypes";

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
