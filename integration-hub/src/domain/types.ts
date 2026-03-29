export type DomainCode = "o2c" | "p2p" | "r2r" | "h2r";

export type OperationType = "create" | "update" | "transition" | "query";

export type JsonSchema = {
  type: string;
  required?: string[];
  properties?: Record<string, { type?: string; enum?: string[] }>;
};

export interface McpFunction {
  id: string;
  name: string;
  description: string;
  entity: string;
  domain: DomainCode;
  aggregateType: string;
  action: string;
  operationType: OperationType;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  backingRoute: string;
  riskLevel?: "Low" | "Medium" | "High";
  governanceTag?: string;
  requiredTier?: number;
}

export interface GovernanceAnnotation {
  riskLevel?: "Low" | "Medium" | "High";
  requiredAuthority?: string;
  requiredTier?: number;
  governanceTag?: string;
}

export interface ProcessLink {
  rel: string;
  href: string;
  method: string;
  mcpFunctionId: string;
  requiredInput: JsonSchema;
  governance?: GovernanceAnnotation;
}

export interface ProcessStateResponse {
  entity: string;
  id: string;
  entityType?: string;
  entityId?: string;
  state: string;
  attributes: Record<string, unknown>;
  links: ProcessLink[];
}

export type SessionMode = "offline" | "online";

export interface HubSessionRecord {
  sessionId: string;
  actorId: string;
  mode: SessionMode;
  context?: Record<string, unknown>;
  createdAt: string;
  endedAt?: string;
  status: "open" | "closed";
}

export interface HubTranscriptEntry {
  input: string;
  output: string;
  timestamp: string;
}

interface HubNavlogBase {
  timestamp: string;
  entityType: string;
  entityId: string;
}

export interface ProposalCandidate {
  rel: string;
  riskLevel?: "Low" | "Medium" | "High";
  requiredTier?: number;
  score?: number;
  reason?: string;
  executable?: boolean;
}

export interface HubNavlogProposalEntry extends HubNavlogBase {
  type: "proposal";
  candidates: ProposalCandidate[];
}

export interface HubNavlogSimulationEntry extends HubNavlogBase {
  type: "simulation";
  action: string;
  mode: SessionMode;
  outcome: {
    predictedState: string;
    predictedEvents: string[];
    riskLevel?: "Low" | "Medium" | "High";
  };
}

export interface HubNavlogDecisionEntry extends HubNavlogBase {
  type: "decision";
  chosenAction: string;
  reason: string;
  governance?: {
    requiredTier?: number;
    actorTier?: number;
    riskLevel?: "Low" | "Medium" | "High";
  };
}

export interface HubNavlogExecutionEntry extends HubNavlogBase {
  type: "execution";
  action: string;
  result: "success" | "failure";
  httpStatus: number;
}

export type HubNavlogEntry =
  | HubNavlogProposalEntry
  | HubNavlogSimulationEntry
  | HubNavlogDecisionEntry
  | HubNavlogExecutionEntry;
