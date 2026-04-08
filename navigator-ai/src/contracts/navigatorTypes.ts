export type NavigatorMode = "EXECUTE" | "REQUEST_APPROVAL" | "REJECT" | "NO_ACTION";

export interface ActionInputSchema {
  type: string;
  required?: string[];
  properties?: Record<string, { type?: string; description?: string; [key: string]: unknown }>;
}

export interface SessionContext {
  domain: "P2P" | "O2C" | "R2R" | "H2R";
  aggregateType: string;
  aggregateId: string;
  actorId: string;
  userNote?: string;
}

export interface CanonicalResource {
  id: string;
  domain: string;
  type: string;
  state: string;
  attributes: Record<string, unknown>;
  links: Record<
    string,
    {
      href: string;
      method: "GET" | "POST";
      rel: string;
      requiresApproval?: boolean;
      requiredTier?: number;
      riskLevel?: string;
      inputSchema?: ActionInputSchema;
    }
  >;
}

export interface ActionOption {
  id: string;
  href: string;
  method: "POST" | "GET";
  domain: string;
  aggregateType: string;
  aggregateId: string;
  currentState: string;
  requiresApproval: boolean;
  requiredTier?: number;
  riskSignals: Record<string, unknown>;
  inputSchema?: ActionInputSchema;
}

export interface NavigatorContext {
  resource: CanonicalResource;
  actionOptions: ActionOption[];
  actorId: string;
  userNote?: string;
  recentHistory: Array<Record<string, unknown>>;
  riskProfile: Record<string, unknown>;
}

export interface RankedAction {
  actionId: string;
  score: number;
  rationale: string;
}

export interface SimulationResult {
  predictedState: string;
  predictedTransitions: string[];
  riskSummary: string;
  financialImpact?: number;
  narrative: string;
}

export interface GovernanceOutcome {
  mode: NavigatorMode;
  requiredTier?: number;
  reasons: string[];
}

export interface DecisionOutcome {
  action: RankedAction | null;
  mode: NavigatorMode;
  explanation: string;
  reasons?: string[];
  requiredTier?: number;
}

export interface ExecutionResult {
  mode: NavigatorMode;
  actionId: string;
  statusCode: number;
  responseBody: Record<string, unknown>;
}

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED" | "EXPIRED";

export interface ApprovalRequestRecord {
  approvalRequestId: string;
  domain: string;
  aggregateType: string;
  aggregateId: string;
  actorId: string;
  actionId: string;
  status: ApprovalRequestStatus;
  requiredTier?: number;
  reasons: string[];
  context: Record<string, unknown>;
  responseBody: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type NavigatorCreateOperation =
  | "create-supplier"
  | "create-requisition"
  | "create-purchase-order"
  | "create-fiscal-year"
  | "create-fiscal-period"
  | "create-payment";

export type NavigatorLookupKind =
  | "suppliers"
  | "ledgers"
  | "fiscal-years"
  | "invoices";

export interface CreateEntityResult {
  operation: NavigatorCreateOperation;
  entityType?: string;
  entityId?: string;
  data: unknown;
}

export interface PromptCreateRequest {
  prompt: string;
  actorId: string;
  domain?: SessionContext["domain"];
  dryRun?: boolean;
}

export interface PromptCreateResolution {
  operation: NavigatorCreateOperation;
  payload: Record<string, unknown>;
  missingFields: string[];
  clarification?: string;
}

export interface PromptCreateResult {
  status: "READY" | "NEEDS_CLARIFICATION";
  resolution: PromptCreateResolution;
  created?: CreateEntityResult;
}

export interface NextStepSuggestion {
  stepId: string;
  kind: "ACTION" | "CREATE_OPERATION";
  score: number;
  rationale: string;
  actionId?: string;
  operation?: NavigatorCreateOperation;
  prerequisites: string[];
}

export interface NextStepResult {
  suggestions: NextStepSuggestion[];
  historySignals: {
    eventCount: number;
    recentEventTypes: string[];
    hasRecentEntityCreated: boolean;
  };
}
