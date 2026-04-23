import { randomUUID } from "node:crypto";
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

export class CaiplService {
  private readonly sessions = new Map<string, CaiplSessionRecord>();

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

    const turn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: "ai",
      messageText: "Session created. I am ready to plan the next step.",
      linkedNodes: [rootNodeId, decisionNodeId],
      linkedArtefacts: [],
      createdAt: now
    };

    this.sessions.set(sessionId, {
      session,
      turns: [turn],
      decisions: [decision],
      planGraph,
      notebook: []
    });

    return {
      session,
      initialTurns: [turn],
      planGraph,
      notebookSnapshot: [],
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

  submitTurn(sessionId: string, input: SubmitTurnInput): CaiplTurnResponse | VersionMismatchResult {
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

    const aiTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: "ai",
      messageText: "Acknowledged. Decision state and artefacts will update after resolution.",
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    record.turns.push(userTurn, aiTurn);
    record.session.updatedAt = now;
    record.session.version += 1;

    return {
      newTurns: [userTurn, aiTurn],
      decisionPoints: record.decisions,
      graphDelta: emptyGraphDelta(),
      notebookDelta: emptyNotebookDelta(),
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
    decision.status = newStatus;
    decision.version += 1;
    decision.resolvedBy = newStatus === "resolved" ? input.actorId : null;
    decision.resolvedAt = newStatus === "resolved" ? now : null;

    record.session.updatedAt = now;
    record.session.version += 1;

    const decisionTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId: record.session.id,
      actor: "system",
      messageText: `Decision ${decision.id} updated to ${decision.status}.`,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    record.turns.push(decisionTurn);

    return {
      updatedDecision: decision,
      graphDelta: emptyGraphDelta(),
      notebookDelta: emptyNotebookDelta(),
      newTurns: [decisionTurn],
      session: record.session
    };
  }

  private findDecision(decisionId: string): { record: CaiplSessionRecord; decision: CaiplDecisionPoint } | undefined {
    for (const record of this.sessions.values()) {
      const decision = record.decisions.find((item) => item.id === decisionId);
      if (decision) {
        return { record, decision };
      }
    }

    return undefined;
  }

  private requireSession(sessionId: string): CaiplSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new HttpError(404, "caipl_session_not_found", `Session '${sessionId}' was not found`);
    }

    return record;
  }
}
