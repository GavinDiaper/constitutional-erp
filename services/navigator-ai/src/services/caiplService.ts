import { randomUUID } from "node:crypto";
import { db } from "../db/connection";
import { loadConfig } from "../config/env";
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

const config = loadConfig();

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

interface PurchaseOrderProposal {
  supplierId: string;
  sku: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  currencyCode: string;
  deliveryAddress: string;
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

function normalizedBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractPurchaseOrderProposal(messageText: string): PurchaseOrderProposal | null {
  const supplierIdMatch = messageText.match(/\bSUP-[A-Za-z0-9-]+\b/);
  const skuMatch = messageText.match(/\bSKU-[A-Za-z0-9_-]+\b/);
  const quantityMatch = messageText.match(/quantity\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const unitPriceMatch = messageText.match(/unit\s*price\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (!supplierIdMatch || !skuMatch || !quantityMatch || !unitPriceMatch) {
    return null;
  }

  const itemMatch = messageText.match(/item\s*[:=\-]?\s*([^\n\r]+)/i);
  const addressMatch = messageText.match(/delivery\s*address\s*[:=\-]?\s*([^\n\r]+)/i);
  const currencyMatch = messageText.match(/\b(AED|USD|EUR|GBP|SAR|QAR)\b/i);

  const quantity = Number(quantityMatch[1]);
  const unitPrice = Number(unitPriceMatch[1]);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }

  return {
    supplierId: supplierIdMatch[0],
    sku: skuMatch[0],
    itemDescription: itemMatch?.[1]?.trim() || skuMatch[0],
    quantity,
    unitPrice,
    currencyCode: (currencyMatch?.[1] ?? "AED").toUpperCase(),
    deliveryAddress: addressMatch?.[1]?.trim() || "TBD"
  };
}

export class CaiplService {
  constructor(private readonly llm: LlmClient) {}

  private summarizeDecisionOption(option: CaiplDecisionPoint["options"][number] | undefined): string {
    if (!option) {
      return "manual action";
    }

    const payload = option.actionPayload;
    const operation = typeof payload["operation"] === "string" ? payload["operation"] : "execute_manual";
    if (operation !== "execute_purchase_order") {
      return operation;
    }

    const supplierId = typeof payload["supplierId"] === "string" ? payload["supplierId"] : "unknown supplier";
    const sku = typeof payload["sku"] === "string" ? payload["sku"] : "unknown sku";
    const quantity = typeof payload["quantity"] === "number" ? payload["quantity"] : "?";
    const unitPrice = typeof payload["unitPrice"] === "number" ? payload["unitPrice"] : "?";
    const currencyCode = typeof payload["currencyCode"] === "string" ? payload["currencyCode"] : "AED";
    return `PO ${supplierId} ${sku} qty ${quantity} @ ${unitPrice} ${currencyCode}`;
  }

  private async generatePostDecisionResponse(input: {
    record: CaiplSessionRecord;
    decisionId: string;
    action: ResolveDecisionInput["action"];
    newStatus: CaiplDecisionStatus;
    decisionSummary: string;
    executionReceipt: ExecutionReceiptSummary | null;
    executionError: string | null;
  }): Promise<string> {
    const recentTurns = input.record.turns
      .slice(-8)
      .map((turn) => `${turn.actor.toUpperCase()}: ${turn.messageText}`)
      .join("\n");

    try {
      const llmText = await this.llm.chat([
        {
          role: "system",
          content:
            "You are the CAIPL assistant for Constitutional ERP. The decision has just been resolved. Provide a concise operational follow-up in 3-8 sentences describing exactly what was confirmed and what happened in ERP. Do not ask the user to reconfirm the same decision."
        },
        {
          role: "user",
          content: [
            `Goal: ${input.record.session.currentGoal}`,
            `Decision ID: ${input.decisionId}`,
            `Decision action: ${input.action}`,
            `Decision status: ${input.newStatus}`,
            `Confirmed action details: ${input.decisionSummary}`,
            `Execution receipt: ${JSON.stringify(input.executionReceipt)}`,
            `Execution error: ${input.executionError ?? "none"}`,
            "Recent conversation:",
            recentTurns || "none"
          ].join("\n")
        }
      ]);

      const text = llmText.trim();
      return text.length > 0
        ? text
        : `Decision ${input.decisionId} resolved as ${input.newStatus}. Action: ${input.decisionSummary}.`;
    } catch {
      if (input.executionReceipt) {
        return `Confirmed and executed: ${input.decisionSummary}. ERP receipt ${input.executionReceipt.entityId} is ${input.executionReceipt.status}.`;
      }

      if (input.executionError) {
        return `Decision confirmed but ERP execution failed: ${input.executionError}. Action attempted: ${input.decisionSummary}.`;
      }

      return `Decision ${input.decisionId} resolved as ${input.newStatus}. Action: ${input.decisionSummary}.`;
    }
  }

  private async executePurchaseOrderProposal(
    proposal: PurchaseOrderProposal,
    actorId: string
  ): Promise<ExecutionReceiptSummary> {
    const baseUrl = normalizedBaseUrl(config.foundationErpUrl);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": config.foundationErpApiKey,
      "x-actor-id": actorId,
      "x-actor-type": actorId === "principal.system" ? "system" : "user",
      "x-actor-tier": actorId === "principal.system" ? "5" : "2"
    };
    headers[config.foundationErpIngressIdHeader] = config.foundationErpIngressId;

    const createResponse = await fetch(`${baseUrl}/api/v1/p2p/purchase-orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        supplierId: proposal.supplierId,
        currencyCode: proposal.currencyCode,
        deliveryAddress: proposal.deliveryAddress,
        legalEntityId: "LE-SEED-AE"
      })
    });
    if (!createResponse.ok) {
      throw new Error(`PO create failed (${createResponse.status})`);
    }

    const createdPo = (await createResponse.json()) as Record<string, unknown>;
    const poId = typeof createdPo["po_id"] === "string" ? createdPo["po_id"] : undefined;
    if (!poId) {
      throw new Error("PO create response did not include po_id");
    }

    const lineResponse = await fetch(`${baseUrl}/api/v1/p2p/purchase-orders/${encodeURIComponent(poId)}/lines`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        description: `${proposal.itemDescription} (${proposal.sku})`,
        quantity: proposal.quantity,
        unitPrice: proposal.unitPrice
      })
    });
    if (!lineResponse.ok) {
      throw new Error(`PO line create failed (${lineResponse.status})`);
    }

    const poResponse = await fetch(`${baseUrl}/api/v1/p2p/purchase-orders/${encodeURIComponent(poId)}`, {
      method: "GET",
      headers
    });
    if (!poResponse.ok) {
      throw new Error(`PO fetch failed (${poResponse.status})`);
    }
    const poSnapshot = (await poResponse.json()) as Record<string, unknown>;
    const state = typeof poSnapshot["state"] === "string" ? poSnapshot["state"] : "Draft";

    return {
      operation: "create_purchase_order",
      entityType: "purchase_order",
      entityId: poId,
      status: state,
      createdAt: new Date().toISOString()
    };
  }

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

    const poProposal = extractPurchaseOrderProposal(input.messageText);
    const activeDecision = record.decisions.find((item) => item.status === "pending");
    let createdDecision: CaiplDecisionPoint | null = null;
    let createdDecisionNode: CaiplPlanGraph["nodes"][number] | null = null;
    let createdDecisionEdge: CaiplPlanEdge | null = null;

    const optionActionPayload = poProposal
      ? {
          operation: "execute_purchase_order",
          supplierId: poProposal.supplierId,
          sku: poProposal.sku,
          itemDescription: poProposal.itemDescription,
          quantity: poProposal.quantity,
          unitPrice: poProposal.unitPrice,
          currencyCode: poProposal.currencyCode,
          deliveryAddress: poProposal.deliveryAddress
        }
      : { operation: "execute_manual" };

    if (!activeDecision) {
      const decisionId = randomUUID();
      const decisionNodeId = randomUUID();
      createdDecision = {
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
            description: assistant.decisionDescription ?? "Proceed with proposed execution.",
            actionPayload: optionActionPayload,
            inputSchema: { fields: [] }
          }
        ]
      };

      createdDecisionNode = {
        id: decisionNodeId,
        type: "decision",
        label: "Confirm next action",
        metadata: { decisionId },
        status: "pending"
      };

      const fromNode = record.planGraph.nodes[record.planGraph.nodes.length - 1]?.id ?? linkedNodeId;
      createdDecisionEdge = {
        edgeId: randomUUID(),
        from: fromNode,
        to: decisionNodeId,
        type: "leads_to"
      };
    }

    if (activeDecision && activeDecision.options.length > 0 && assistant.decisionDescription) {
      activeDecision.options[0] = {
        ...activeDecision.options[0],
        description: assistant.decisionDescription,
        actionPayload: optionActionPayload
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

      if (createdDecision) {
        db.prepare(
          `INSERT INTO caipl_decision(
            id, session_id, decision_type, status, resolved_by, resolved_at, version, options_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createdDecision.id,
          createdDecision.sessionId,
          createdDecision.type,
          createdDecision.status,
          createdDecision.resolvedBy,
          createdDecision.resolvedAt,
          createdDecision.version,
          JSON.stringify(createdDecision.options),
          now,
          now
        );
      }

      if (createdDecisionNode) {
        db.prepare(
          `INSERT INTO caipl_plan_node(
            id, session_id, node_type, label, metadata_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createdDecisionNode.id,
          sessionId,
          createdDecisionNode.type,
          createdDecisionNode.label,
          JSON.stringify(createdDecisionNode.metadata),
          createdDecisionNode.status,
          now,
          now
        );
      }

      if (createdDecisionEdge) {
        db.prepare(
          `INSERT INTO caipl_plan_edge(
            edge_id, session_id, from_node, to_node, edge_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          createdDecisionEdge.edgeId,
          sessionId,
          createdDecisionEdge.from,
          createdDecisionEdge.to,
          createdDecisionEdge.type,
          now
        );
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
    if (createdDecision) {
      record.decisions.push(createdDecision);
    }
    if (createdDecisionNode) {
      record.planGraph.nodes.push(createdDecisionNode);
    }
    if (createdDecisionEdge) {
      record.planGraph.edges.push(createdDecisionEdge);
    }
    record.session.updatedAt = now;
    record.session.version = nextVersion;

    const graphDelta: CaiplGraphDelta = {
      addedNodes: createdDecisionNode ? [createdDecisionNode] : [],
      updatedNodes: [],
      removedNodes: [],
      addedEdges: createdDecisionEdge ? [createdDecisionEdge] : [],
      removedEdges: []
    };

    return {
      newTurns: [userTurn, aiTurn],
      decisionPoints: record.decisions,
      graphDelta,
      notebookDelta: {
        added: [notebookArtefact],
        updated: [],
        removed: []
      },
      session: record.session
    };
  }

  async resolveDecision(decisionId: string, input: ResolveDecisionInput): Promise<CaiplDecisionResolveResponse | VersionMismatchResult> {
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

    if (decision.status !== "pending") {
      throw new HttpError(
        409,
        "caipl_decision_not_pending",
        `Decision '${decisionId}' is already ${decision.status} and cannot be resolved again.`
      );
    }

    const now = new Date().toISOString();
    let newStatus = decisionStatusForAction(input.action);
    const nextDecisionVersion = decision.version + 1;
    const nextSessionVersion = record.session.version + 1;
    let resolvedBy: string | null = null;
    let resolvedAt: string | null = null;
    const linkedNodeId =
      record.planGraph.nodes.find((node) => {
        const candidate = node.metadata["decisionId"];
        return typeof candidate === "string" && candidate === decision.id;
      })?.id ?? record.planGraph.nodes[0]?.id ?? "unlinked";

    const selectedOption =
      (input.optionId ? decision.options.find((option) => option.id === input.optionId) : undefined) ??
      decision.options[0];
    const decisionSummary = this.summarizeDecisionOption(selectedOption);

    let executionReceipt: ExecutionReceiptSummary | null = null;
    let executionError: string | null = null;
    if (input.action === "confirm") {
      const payload = selectedOption?.actionPayload ?? {};
      if (payload && typeof payload === "object" && payload["operation"] === "execute_purchase_order") {
        const proposal = payload as unknown as PurchaseOrderProposal;
        try {
          executionReceipt = await this.executePurchaseOrderProposal(proposal, input.actorId);
        } catch (error) {
          newStatus = "failed";
          executionError = error instanceof Error ? error.message : "Unknown execution error";
        }
      }
    }

    if (newStatus === "resolved" || newStatus === "executed" || newStatus === "failed") {
      resolvedBy = input.actorId;
      resolvedAt = now;
    }

    const notebookArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: {
        decisionId: decision.id,
        action: input.action,
        status: newStatus,
        note: input.note ?? null,
        optionId: input.optionId ?? null,
        executionError: executionError ?? null
      },
      linkedNodeId
    };

    const executionReceiptArtefact: CaiplArtefact | null = executionReceipt
      ? {
          id: randomUUID(),
          type: "note",
          content: {
            type: "erp_execution_receipt",
            ...executionReceipt
          },
          linkedNodeId
        }
      : null;

    const decisionTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId: record.session.id,
      actor: "system",
      messageText:
        executionReceipt
          ? `Decision ${decision.id} updated to ${newStatus}. Confirmed: ${decisionSummary}. ERP execution receipt: ${executionReceipt.entityId} (${executionReceipt.status}).`
          : executionError
            ? `Decision ${decision.id} updated to ${newStatus}. Confirmed: ${decisionSummary}. ERP execution failed: ${executionError}`
            : `Decision ${decision.id} updated to ${newStatus}. Confirmed: ${decisionSummary}.`,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    const aiFollowupText = await this.generatePostDecisionResponse({
      record,
      decisionId: decision.id,
      action: input.action,
      newStatus,
      decisionSummary,
      executionReceipt,
      executionError
    });

    const aiFollowupTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId: record.session.id,
      actor: "ai",
      messageText: aiFollowupText,
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
      decisionNode.label =
        input.action === "confirm"
          ? `Confirmed: ${decisionSummary}`
          : `${input.action[0].toUpperCase()}${input.action.slice(1)}: ${decisionSummary}`;
      decisionNode.metadata = {
        ...decisionNode.metadata,
        lastResolvedAction: input.action,
        lastResolvedStatus: newStatus,
        lastResolvedSummary: decisionSummary,
        lastReceiptEntityId: executionReceipt?.entityId ?? null,
        lastExecutionError: executionError
      };
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

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aiFollowupTurn.id,
        aiFollowupTurn.sessionId,
        aiFollowupTurn.actor,
        aiFollowupTurn.messageText,
        JSON.stringify(aiFollowupTurn.linkedNodes),
        JSON.stringify(aiFollowupTurn.linkedArtefacts),
        aiFollowupTurn.createdAt
      );

      db.prepare(`UPDATE caipl_session SET updated_at = ?, version = ? WHERE id = ?`).run(
        now,
        nextSessionVersion,
        record.session.id
      );

      if (decisionNode) {
        db.prepare(
          `UPDATE caipl_plan_node
           SET label = ?, metadata_json = ?, status = ?, updated_at = ?
           WHERE id = ? AND session_id = ?`
        ).run(
          decisionNode.label,
          JSON.stringify(decisionNode.metadata),
          decisionNodeStatus,
          now,
          decisionNode.id,
          record.session.id
        );
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

      if (executionReceiptArtefact) {
        const serializedExecutionReceiptContent = serializeArtefactContent(executionReceiptArtefact.content);
        db.prepare(
          `INSERT INTO caipl_notebook_artefact(
            id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          executionReceiptArtefact.id,
          record.session.id,
          executionReceiptArtefact.type,
          serializedExecutionReceiptContent.contentJson,
          serializedExecutionReceiptContent.contentText,
          executionReceiptArtefact.linkedNodeId,
          now,
          now
        );
      }
    });

    write();

    decision.status = newStatus;
    decision.version = nextDecisionVersion;
    decision.resolvedBy = resolvedBy;
    decision.resolvedAt = resolvedAt;

    record.session.updatedAt = now;
    record.session.version = nextSessionVersion;
    record.turns.push(decisionTurn, aiFollowupTurn);
    record.notebook.push(notebookArtefact);
    if (executionReceiptArtefact) {
      record.notebook.push(executionReceiptArtefact);
    }

    return {
      updatedDecision: decision,
      graphDelta,
      notebookDelta: {
        added: executionReceiptArtefact ? [notebookArtefact, executionReceiptArtefact] : [notebookArtefact],
        updated: [],
        removed: []
      },
      newTurns: [decisionTurn, aiFollowupTurn],
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
    const pendingDecision = record.decisions.find((item) => item.status === "pending");
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
