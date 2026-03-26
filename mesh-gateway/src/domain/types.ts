export type AuthorityDomain = "O2C" | "P2P" | "R2R" | "H2R";

export interface AuthorityCheckResult {
  allowed: boolean;
  effectiveTier?: number;
  requiredTier?: number;
  reasons: string[];
}

export interface GovernanceCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  requiredApproverTier?: number;
  escalatedToTier?: number;
  riskLevel?: "Low" | "Medium" | "High";
  violations: string[];
  constraints: string[];
  matchedRules: string[];
}

export interface LinkDef {
  href: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  requiresApproval?: boolean;
  requiredApproverTier?: number;
  escalatedToTier?: number;
}

export interface PendingApprovalTask {
  taskId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  requestedBy: string;
  domain: AuthorityDomain;
  resourceId: string;
  action: string;
  requiredTier?: number;
  escalatedToTier?: number;
  originalRequestPath: string;
  originalRequestBody: string;
  contextJson: string;
  decisionSnapshotJson: string;
  requestFingerprint: string;
}
