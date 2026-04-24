export type CaiplDecisionStatus =
  | "pending"
  | "confirmed"
  | "executing"
  | "executed"
  | "failed"
  | "escalated"
  | "resolved";

export type CaiplPlanNodeStatus = "pending" | "active" | "completed" | "blocked" | "failed";

export interface CaiplSession {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  currentGoal: string;
  roleContext?: string;
  mode?: "create" | "select" | "investigate" | "fix" | "advance";
  currentStepId: string | null;
  status: "active" | "archived";
  version: number;
}

export interface CaiplPlanNode {
  id: string;
  type: "process_step" | "entity" | "decision" | "data_collection" | "mcp_action";
  label: string;
  metadata: Record<string, unknown>;
  status: CaiplPlanNodeStatus;
}

export interface CaiplPlanEdge {
  edgeId: string;
  from: string;
  to: string;
  type: "depends_on" | "leads_to" | "requires";
}

export interface CaiplPlanGraph {
  nodes: CaiplPlanNode[];
  edges: CaiplPlanEdge[];
}

export interface CaiplGraphDelta {
  addedNodes: CaiplPlanNode[];
  updatedNodes: CaiplPlanNode[];
  removedNodes: string[];
  addedEdges: CaiplPlanEdge[];
  removedEdges: string[];
}

export interface CaiplInputSchemaField {
  id: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "entityRef";
  required: boolean;
  options?: Array<string | number>;
}

export interface CaiplInputSchema {
  fields: CaiplInputSchemaField[];
}

export interface CaiplDecisionOption {
  id: string;
  label: string;
  description: string;
  actionPayload: Record<string, unknown>;
  inputSchema: CaiplInputSchema;
}

export interface CaiplDecisionPoint {
  id: string;
  sessionId: string;
  type: string;
  options: CaiplDecisionOption[];
  status: CaiplDecisionStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  version: number;
}

export interface CaiplArtefact {
  id: string;
  type: "document" | "note" | "form" | "table";
  content: Record<string, unknown> | string;
  linkedNodeId: string;
}

export interface CaiplNotebookDelta {
  added: CaiplArtefact[];
  updated: CaiplArtefact[];
  removed: string[];
}

export interface CaiplInteractionTurn {
  id: string;
  sessionId: string;
  actor: "user" | "ai" | "system";
  messageText: string;
  linkedNodes: string[];
  linkedArtefacts: string[];
  createdAt: string;
}

export interface CaiplVersionMismatch {
  scope: "session" | "decision";
  currentVersion: number;
  sessionId?: string;
  decisionId?: string;
}

export interface CaiplSessionSnapshot {
  session: CaiplSession;
  turns: CaiplInteractionTurn[];
  decisions: CaiplDecisionPoint[];
  planGraph: CaiplPlanGraph;
  notebook: CaiplArtefact[];
}

export interface CaiplCreateSessionResponse {
  session: CaiplSession;
  initialTurns: CaiplInteractionTurn[];
  planGraph: CaiplPlanGraph;
  notebookSnapshot: CaiplArtefact[];
  decisions: CaiplDecisionPoint[];
}

export interface CaiplTurnResponse {
  newTurns: CaiplInteractionTurn[];
  decisionPoints: CaiplDecisionPoint[];
  graphDelta: CaiplGraphDelta;
  notebookDelta: CaiplNotebookDelta;
  session: CaiplSession;
}

export interface CaiplDecisionResolveResponse {
  updatedDecision: CaiplDecisionPoint;
  graphDelta: CaiplGraphDelta;
  notebookDelta: CaiplNotebookDelta;
  newTurns: CaiplInteractionTurn[];
  session: CaiplSession;
}
