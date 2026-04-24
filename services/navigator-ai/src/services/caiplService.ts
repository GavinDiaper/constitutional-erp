import { randomUUID } from "node:crypto";
import { db } from "../db/connection";
import { LlmClient } from "../llm/types";
import {
  CaiplArtefact,
  CaiplCreateSessionResponse,
  CaiplDecisionPoint,
  CaiplDecisionResolveResponse,
  CaiplDecisionStatus,
  CaiplGraphDelta,
  CaiplInteractionTurn,
  CaiplNotebookDelta,
  CaiplPlanEdge,
  CaiplPlanGraph,
  CaiplSession,
  CaiplSessionSnapshot,
  CaiplTurnResponse,
  CaiplVersionMismatch
} from "../contracts/caiplTypes";
import { HttpError } from "../utils/errors";

interface CreateSessionInput {
  userId: string;
  currentGoal: string;
}

interface SubmitTurnInput {
  actor: "user" | "ai" | "system";
  messageText: string;
  sessionVersion: number;
}

interface ResolveDecisionInput {
  action: "confirm" | "reject" | "amend" | "retry" | "escalate";
  actorId: string;
  decisionVersion: number;
  sessionVersion: number;
  note?: string;
  formInput?: Record<string, unknown>;
  optionId?: string;
}

interface CaiplSessionRecord {
  session: CaiplSession;
  turns: CaiplInteractionTurn[];
  decisions: CaiplDecisionPoint[];
  planGraph: CaiplPlanGraph;
  notebook: CaiplArtefact[];
}

interface ExecutionReceiptSummary {
  operation: string;
  entityType: string;
  entityId: string;
  status: string;
  createdAt: string;
}

type VersionMismatchResult = {
  conflict: CaiplVersionMismatch;
};

function emptyGraphDelta(): CaiplGraphDelta {
  return {
    addedNodes: [],
    updatedNodes: [],
    removedNodes: [],
    addedEdges: [],
    removedEdges: []
  };
}

function emptyNotebookDelta(): CaiplNotebookDelta {
  return {
    added: [],
    updated: [],
    removed: []
  };
}

function decisionStatusForAction(action: ResolveDecisionInput["action"]): CaiplDecisionStatus {
  switch (action) {
    case "confirm":
      return "executed";
    case "reject":
      return "resolved";
    case "amend":
      return "resolved";
    case "retry":
      return "pending";
    case "escalate":
      return "escalated";
    default:
      return "failed";
  }
}

function nodeStatusForDecisionStatus(status: CaiplDecisionStatus): "pending" | "active" | "completed" | "blocked" | "failed" {
  switch (status) {
    case "executed":
    case "resolved":
      return "completed";
    case "failed":
    case "escalated":
      return "failed";
    case "pending":
      return "pending";
    case "confirmed":
    case "executing":
      return "active";
    default:
      return "blocked";
  }
}

function serializeArtefactContent(content: Record<string, unknown> | string): {
  contentJson: string | null;
  contentText: string | null;
} {
  if (typeof content === "string") {
    return {
      contentJson: null,
      contentText: content
    };
  }

  return {
    contentJson: JSON.stringify(content),
    contentText: null
  };
}

export class CaiplService {
  constructor(private readonly llm: LlmClient) {}

  private summarizeExecutionReceipts(record: CaiplSessionRecord): ExecutionReceiptSummary[] {
    const receipts: ExecutionReceiptSummary[] = [];

    for (const artefact of record.notebook) {
      if (!artefact.content || typeof artefact.content !== "object" || Array.isArray(artefact.content)) {
        continue;
      }

      const content = artefact.content as Record<string, unknown>;
      if (content["type"] !== "erp_execution_receipt") {
        continue;
      }

      const operation = typeof content["operation"] === "string" ? content["operation"] : "unknown";
      const entityType = typeof content["entityType"] === "string" ? content["entityType"] : "unknown";
      const entityId = typeof content["entityId"] === "string" ? content["entityId"] : "unknown";
      const status = typeof content["status"] === "string" ? content["status"] : "unknown";
      const createdAt = typeof content["createdAt"] === "string" ? content["createdAt"] : "unknown";

      receipts.push({
        operation,
        entityType,
        entityId,
        status,
        createdAt
      });
    }

    return receipts.slice(-5);
  }

  private enforceExecutionGrounding(response: string, hasExecutionReceipt: boolean): string {
    if (hasExecutionReceipt) {
      return response;
    }

    const claimsExecution = /\b(created|issued|approved|sent|executed|posted|updated|cancelled|closed)\b/i.test(response);
    const mentionsTransaction = /\b(po\b|purchase order|requisition|invoice|goods receipt|payment)\b/i.test(response);
    if (!claimsExecution || !mentionsTransaction) {
      return response;
    }

    return [
      "No ERP transaction has been executed yet in this CAIPL session.",
      "I can propose the exact action and wait for explicit execution confirmation.",
      response
    ].join(" ");
  }

  createSession(input: CreateSessionInput): CaiplCreateSessionResponse {
    const now = new Date().toISOString();
    const sessionId = randomUUID();

    const session: CaiplSession = {
      id: sessionId,
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
      currentGoal: input.currentGoal,
      currentStepId: null,
      status: "active",
      version: 1
    };

    const rootNodeId = randomUUID();
    const decisionNodeId = randomUUID();
    const decisionId = randomUUID();
    const edge: CaiplPlanEdge = {
      edgeId: randomUUID(),
      from: rootNodeId,
      to: decisionNodeId,
      type: "leads_to"
    };

    const planGraph: CaiplPlanGraph = {
      nodes: [
        {
          id: rootNodeId,
          type: "process_step",
          label: "Define execution intent",
          metadata: { goal: input.currentGoal },
          status: "active"
        },
        {
          id: decisionNodeId,
          type: "decision",
          label: "Confirm next action",
          metadata: { decisionId },
          status: "pending"
        }
      ],
      edges: [edge]
    };

    const decision: CaiplDecisionPoint = {
      id: decisionId,
      sessionId,
      type: "action_confirmation",
      status: "pending",
      resolvedBy: null,
      resolvedAt: null,
      version: 1,
      options: [
        {
          id: "confirm-next-step",
          label: "Confirm",
          description: "Proceed with proposed execution.",
          actionPayload: {
            operation: "execute"
          },
          inputSchema: {
            fields: []
          }
        }
      ]
    };

    const initialArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: `Session started for goal: ${input.currentGoal}`,
      linkedNodeId: rootNodeId
    };

    const turn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: "ai",
      messageText: "Session created. I am ready to plan the next step.",
      linkedNodes: [rootNodeId, decisionNodeId],
      linkedArtefacts: [],
      createdAt: now
    };

    const write = db.transaction(() => {
      db.prepare(
        `INSERT INTO caipl_session(
          id, user_id, created_at, updated_at, current_goal, current_step_id, status, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        session.id,
        session.userId,
        session.createdAt,
        session.updatedAt,
        session.currentGoal,
        session.currentStepId,
        session.status,
        session.version
      );

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        turn.id,
        turn.sessionId,
        turn.actor,
        turn.messageText,
        JSON.stringify(turn.linkedNodes),
        JSON.stringify(turn.linkedArtefacts),
        turn.createdAt
      );

      db.prepare(
        `INSERT INTO caipl_decision(
          id, session_id, decision_type, status, resolved_by, resolved_at, version, options_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        decision.id,
        decision.sessionId,
        decision.type,
        decision.status,
        decision.resolvedBy,
        decision.resolvedAt,
        decision.version,
        JSON.stringify(decision.options),
        now,
        now
      );

      for (const node of planGraph.nodes) {
        db.prepare(
          `INSERT INTO caipl_plan_node(
            id, session_id, node_type, label, metadata_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          node.id,
          session.id,
          node.type,
          node.label,
          JSON.stringify(node.metadata),
          node.status,
          now,
          now
        );
      }

      for (const edgeItem of planGraph.edges) {
        db.prepare(
          `INSERT INTO caipl_plan_edge(
            edge_id, session_id, from_node, to_node, edge_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          edgeItem.edgeId,
          session.id,
          edgeItem.from,
          edgeItem.to,
          edgeItem.type,
          now
        );
      }

      const serializedInitialContent = serializeArtefactContent(initialArtefact.content);
      db.prepare(
        `INSERT INTO caipl_notebook_artefact(
          id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        initialArtefact.id,
        session.id,
        initialArtefact.type,
        serializedInitialContent.contentJson,
        serializedInitialContent.contentText,
        initialArtefact.linkedNodeId,
        now,
        now
      );
    });

    write();

    return {
      session,
      initialTurns: [turn],
      planGraph,
      notebookSnapshot: [initialArtefact],
      decisions: [decision]
    };
  }

  getSession(sessionId: string): CaiplSessionSnapshot {
    const record = this.requireSession(sessionId);
    return {
      session: record.session,
      turns: record.turns,
      decisions: record.decisions,
      planGraph: record.planGraph,
      notebook: record.notebook
    };
  }

  async submitTurn(sessionId: string, input: SubmitTurnInput): Promise<CaiplTurnResponse | VersionMismatchResult> {
    const record = this.requireSession(sessionId);

    if (input.sessionVersion !== record.session.version) {
      return {
        conflict: {
          scope: "session",
          currentVersion: record.session.version,
          sessionId
        }
      };
    }

    const now = new Date().toISOString();
    const userTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: input.actor,
      messageText: input.messageText,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    const assistant = await this.generateAssistantResponse(record, input.messageText);

    const aiTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: "ai",
      messageText: assistant.response,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };
    const linkedNodeId = record.planGraph.nodes[0]?.id ?? "unlinked";
    const notebookArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: {
        type: "llm_turn_reasoning",
        prompt: input.messageText,
        response: assistant.response,
        reasoningSummary: assistant.reasoning,
        provider: this.llm.provider,
        model: this.llm.model
      },
      linkedNodeId
    };

    const activeDecision = record.decisions.find((item) => item.status === "pending") ?? record.decisions[0];
    if (activeDecision && activeDecision.options.length > 0 && assistant.decisionDescription) {
      activeDecision.options[0] = {
        ...activeDecision.options[0],
        description: assistant.decisionDescription
      };
    }

    const nextVersion = record.session.version + 1;
    const write = db.transaction(() => {
      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userTurn.id,
        userTurn.sessionId,
        userTurn.actor,
        userTurn.messageText,
        JSON.stringify(userTurn.linkedNodes),
        JSON.stringify(userTurn.linkedArtefacts),
        userTurn.createdAt
      );

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aiTurn.id,
        aiTurn.sessionId,
        aiTurn.actor,
        aiTurn.messageText,
        JSON.stringify(aiTurn.linkedNodes),
        JSON.stringify(aiTurn.linkedArtefacts),
        aiTurn.createdAt
      );

      db.prepare(`UPDATE caipl_session SET updated_at = ?, version = ? WHERE id = ?`).run(
        now,
        nextVersion,
        sessionId
      );

      if (activeDecision) {
        db.prepare(
          `UPDATE caipl_decision
           SET options_json = ?, updated_at = ?
           WHERE id = ? AND session_id = ?`
        ).run(JSON.stringify(activeDecision.options), now, activeDecision.id, sessionId);
      }

      const serializedNotebookContent = serializeArtefactContent(notebookArtefact.content);
      db.prepare(
        `INSERT INTO caipl_notebook_artefact(
          id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        notebookArtefact.id,
        sessionId,
        notebookArtefact.type,
        serializedNotebookContent.contentJson,
        serializedNotebookContent.contentText,
        notebookArtefact.linkedNodeId,
        now,
        now
      );
    });

    write();

    record.turns.push(userTurn, aiTurn);
    record.notebook.push(notebookArtefact);
    record.session.updatedAt = now;
    record.session.version = nextVersion;

    return {
      newTurns: [userTurn, aiTurn],
      decisionPoints: record.decisions,
      graphDelta: emptyGraphDelta(),
      notebookDelta: {
        added: [notebookArtefact],
        updated: [],
        removed: []
      },
      session: record.session
    };
  }

  resolveDecision(decisionId: string, input: ResolveDecisionInput): CaiplDecisionResolveResponse | VersionMismatchResult {
    const match = this.findDecision(decisionId);
    if (!match) {
      throw new HttpError(404, "caipl_decision_not_found", `Decision '${decisionId}' was not found`);
    }

    const { record, decision } = match;
    if (input.sessionVersion !== record.session.version) {
      return {
        conflict: {
          scope: "session",
          currentVersion: record.session.version,
          sessionId: record.session.id,
          decisionId
        }
      };
    }

    if (input.decisionVersion !== decision.version) {
      return {
        conflict: {
          scope: "decision",
          currentVersion: decision.version,
          sessionId: record.session.id,
          decisionId
        }
      };
    }

    const now = new Date().toISOString();
    const newStatus = decisionStatusForAction(input.action);
    const nextDecisionVersion = decision.version + 1;
    const nextSessionVersion = record.session.version + 1;
    const resolvedBy = newStatus === "resolved" ? input.actorId : null;
    const resolvedAt = newStatus === "resolved" ? now : null;
    const linkedNodeId =
      record.planGraph.nodes.find((node) => {
        const candidate = node.metadata["decisionId"];
        return typeof candidate === "string" && candidate === decision.id;
      })?.id ?? record.planGraph.nodes[0]?.id ?? "unlinked";

    const notebookArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: {
        decisionId: decision.id,
        action: input.action,
        status: newStatus,
        note: input.note ?? null,
        optionId: input.optionId ?? null
      },
      linkedNodeId
    };

    const decisionTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId: record.session.id,
      actor: "system",
      messageText: `Decision ${decision.id} updated to ${newStatus}.`,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    const decisionNode = record.planGraph.nodes.find((node) => {
      const value = node.metadata["decisionId"];
      return typeof value === "string" && value === decision.id;
    });
    const decisionNodeStatus = nodeStatusForDecisionStatus(newStatus);
    const graphDelta: CaiplGraphDelta = emptyGraphDelta();
    if (decisionNode) {
      decisionNode.status = decisionNodeStatus;
      graphDelta.updatedNodes = [decisionNode];
    }

    const write = db.transaction(() => {
      db.prepare(
        `UPDATE caipl_decision
         SET status = ?, resolved_by = ?, resolved_at = ?, version = ?, updated_at = ?
         WHERE id = ?`
      ).run(newStatus, resolvedBy, resolvedAt, nextDecisionVersion, now, decision.id);

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        decisionTurn.id,
        decisionTurn.sessionId,
        decisionTurn.actor,
        decisionTurn.messageText,
        JSON.stringify(decisionTurn.linkedNodes),
        JSON.stringify(decisionTurn.linkedArtefacts),
        decisionTurn.createdAt
      );

      db.prepare(`UPDATE caipl_session SET updated_at = ?, version = ? WHERE id = ?`).run(
        now,
        nextSessionVersion,
        record.session.id
      );

      if (decisionNode) {
        db.prepare(
          `UPDATE caipl_plan_node
           SET status = ?, updated_at = ?
           WHERE id = ? AND session_id = ?`
        ).run(decisionNodeStatus, now, decisionNode.id, record.session.id);
      }

      const serializedNotebookContent = serializeArtefactContent(notebookArtefact.content);
      db.prepare(
        `INSERT INTO caipl_notebook_artefact(
          id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        notebookArtefact.id,
        record.session.id,
        notebookArtefact.type,
        serializedNotebookContent.contentJson,
        serializedNotebookContent.contentText,
        notebookArtefact.linkedNodeId,
        now,
        now
      );
    });

    write();

    decision.status = newStatus;
    decision.version = nextDecisionVersion;
    decision.resolvedBy = resolvedBy;
    decision.resolvedAt = resolvedAt;

    record.session.updatedAt = now;
    record.session.version = nextSessionVersion;
    record.turns.push(decisionTurn);
    record.notebook.push(notebookArtefact);

    return {
      updatedDecision: decision,
      graphDelta,
      notebookDelta: {
        added: [notebookArtefact],
        updated: [],
        removed: []
      },
      newTurns: [decisionTurn],
      session: record.session
    };
  }

  private findDecision(decisionId: string): { record: CaiplSessionRecord; decision: CaiplDecisionPoint } | undefined {
    const rows = db.prepare(`SELECT id FROM caipl_session`).all() as Array<{ id: string }>;
    for (const row of rows) {
      const record = this.requireSession(row.id);
      const decision = record.decisions.find((item) => item.id === decisionId);
      if (decision) {
        return { record, decision };
      }
    }

    return undefined;
  }

  private requireSession(sessionId: string): CaiplSessionRecord {
    const sessionRow = db.prepare(
      `SELECT id, user_id, created_at, updated_at, current_goal, current_step_id, status, version
       FROM caipl_session WHERE id = ?`
    ).get(sessionId) as
      | {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          current_goal: string;
          current_step_id: string | null;
          status: "active" | "archived";
          version: number;
        }
      | undefined;

    if (!sessionRow) {
      throw new HttpError(404, "caipl_session_not_found", `Session '${sessionId}' was not found`);
    }

    const turns = db.prepare(
      `SELECT id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
       FROM caipl_turn WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      session_id: string;
      actor: "user" | "ai" | "system";
      message_text: string;
      linked_nodes_json: string;
      linked_artefacts_json: string;
      created_at: string;
    }>;

    const decisions = db.prepare(
      `SELECT id, session_id, decision_type, status, resolved_by, resolved_at, version, options_json
       FROM caipl_decision WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      session_id: string;
      decision_type: string;
      status: CaiplDecisionStatus;
      resolved_by: string | null;
      resolved_at: string | null;
      version: number;
      options_json: string;
    }>;

    const nodes = db.prepare(
      `SELECT id, node_type, label, metadata_json, status
       FROM caipl_plan_node WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      node_type: "process_step" | "entity" | "decision" | "data_collection" | "mcp_action";
      label: string;
      metadata_json: string;
      status: "pending" | "active" | "completed" | "blocked" | "failed";
    }>;

    const edges = db.prepare(
      `SELECT edge_id, from_node, to_node, edge_type
       FROM caipl_plan_edge WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      edge_id: string;
      from_node: string;
      to_node: string;
      edge_type: "depends_on" | "leads_to" | "requires";
    }>;

    const notebook = db.prepare(
      `SELECT id, artefact_type, content_json, content_text, linked_node_id
       FROM caipl_notebook_artefact WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      artefact_type: "document" | "note" | "form" | "table";
      content_json: string | null;
      content_text: string | null;
      linked_node_id: string;
    }>;

    return {
      session: {
        id: sessionRow.id,
        userId: sessionRow.user_id,
        createdAt: sessionRow.created_at,
        updatedAt: sessionRow.updated_at,
        currentGoal: sessionRow.current_goal,
        currentStepId: sessionRow.current_step_id,
        status: sessionRow.status,
        version: sessionRow.version
      },
      turns: turns.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        actor: row.actor,
        messageText: row.message_text,
        linkedNodes: this.parseStringArray(row.linked_nodes_json),
        linkedArtefacts: this.parseStringArray(row.linked_artefacts_json),
        createdAt: row.created_at
      })),
      decisions: decisions.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        type: row.decision_type,
        options: this.parseJsonArray(row.options_json) as CaiplDecisionPoint["options"],
        status: row.status,
        resolvedBy: row.resolved_by,
        resolvedAt: row.resolved_at,
        version: row.version
      })),
      planGraph: {
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.node_type,
          label: node.label,
          metadata: this.parseJsonObject(node.metadata_json),
          status: node.status
        })),
        edges: edges.map((edge) => ({
          edgeId: edge.edge_id,
          from: edge.from_node,
          to: edge.to_node,
          type: edge.edge_type
        }))
      },
      notebook: notebook.map((artefact) => ({
        id: artefact.id,
        type: artefact.artefact_type,
        content: artefact.content_json ? this.parseJsonObject(artefact.content_json) : artefact.content_text ?? "",
        linkedNodeId: artefact.linked_node_id
      }))
    };
  }

  private parseStringArray(value: string): string[] {
    const parsed = this.parseJsonArray(value);
    return parsed.filter((item): item is string => typeof item === "string");
  }

  private parseJsonArray(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseJsonObject(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private parseJsonObjectFromText(value: string): Record<string, unknown> | undefined {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private async generateAssistantResponse(
    record: CaiplSessionRecord,
    userMessage: string
  ): Promise<{ response: string; reasoning: string; decisionDescription?: string }> {
    const recentTurns = record.turns.slice(-8).map((turn) => `${turn.actor.toUpperCase()}: ${turn.messageText}`).join("\n");
    const pendingDecision = record.decisions.find((item) => item.status === "pending") ?? record.decisions[0];
    const executionReceipts = this.summarizeExecutionReceipts(record);
    const hasExecutionReceipt = executionReceipts.length > 0;

    try {
      const llmText = await this.llm.chat([
        {
          role: "system",
          content:
            "You are the CAIPL assistant for Constitutional ERP. Provide practical operator guidance, keep responses concise, and ground everything in provided session context. Never claim an ERP write operation was completed unless an explicit execution receipt is provided in the context. If no execution receipt exists, clearly state that actions are proposed only and awaiting execution. Output JSON only with keys response, reasoningSummary, decisionDescription."
        },
        {
          role: "user",
          content: [
            `Goal: ${record.session.currentGoal}`,
            pendingDecision
              ? `Active decision: ${pendingDecision.type} [${pendingDecision.status}]`
              : "Active decision: none",
            `Execution receipts: ${JSON.stringify(executionReceipts)}`,
            "Conversation so far:",
            recentTurns || "none",
            `Latest user message: ${userMessage}`,
            "Return JSON with keys: response (string), reasoningSummary (string), decisionDescription (string)."
          ].join("\n")
        }
      ]);

      const parsed = this.parseJsonObjectFromText(llmText);
      const response =
        parsed && typeof parsed["response"] === "string" && parsed["response"].trim().length > 0
          ? String(parsed["response"]).trim()
          : llmText.trim();
      const groundedResponse = this.enforceExecutionGrounding(response, hasExecutionReceipt);

      const reasoning =
        parsed && typeof parsed["reasoningSummary"] === "string"
          ? String(parsed["reasoningSummary"]).trim()
          : "Reasoning summary unavailable; raw assistant response used.";

      const decisionDescription =
        parsed && typeof parsed["decisionDescription"] === "string"
          ? String(parsed["decisionDescription"]).trim()
          : undefined;

      return {
        response: groundedResponse,
        reasoning,
        decisionDescription
      };
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : "Unknown LLM error";
      return {
        response:
          "I could not complete the model reasoning step right now. Please retry your request or refine your goal statement.",
        reasoning: `LLM call failed: ${fallbackReason}`
      };
    }
  }
}
