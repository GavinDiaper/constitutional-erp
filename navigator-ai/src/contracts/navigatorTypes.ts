export type NavigatorMode = "EXECUTE" | "REQUEST_APPROVAL" | "REJECT" | "NO_ACTION";

export interface SessionContext {
  domain: "P2P" | "O2C" | "R2R" | "H2R";
  aggregateType: string;
  aggregateId: string;
  actorId: string;
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
}

export interface NavigatorContext {
  resource: CanonicalResource;
  actionOptions: ActionOption[];
  actorId: string;
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
}

export interface ExecutionResult {
  mode: NavigatorMode;
  actionId: string;
  statusCode: number;
  responseBody: Record<string, unknown>;
}
