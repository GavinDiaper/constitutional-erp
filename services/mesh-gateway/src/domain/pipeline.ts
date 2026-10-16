import { AuthorityClient } from "../clients/authorityClient";
import { GovernanceClient } from "../clients/governanceClient";
import { AuthorityCheckResult, AuthorityDomain, GovernanceCheckResult } from "./types";

export type PipelineDecision =
  | { outcome: "deny"; stage: "authority" | "governance"; reason: string; authority: AuthorityCheckResult; governance?: GovernanceCheckResult }
  | { outcome: "approval"; requiredTier: number; authority: AuthorityCheckResult; governance: GovernanceCheckResult }
  | { outcome: "allow"; authority: AuthorityCheckResult; governance: GovernanceCheckResult };

// Authority answers "who may", Governance answers "is it permissible"; approval/escalation is a third outcome, not a denial.
export async function evaluatePipeline(
  clients: { authorityClient: AuthorityClient; governanceClient: GovernanceClient },
  input: { actorId: string; action: string; domain: AuthorityDomain; context: Record<string, unknown> }
): Promise<PipelineDecision> {
  const authority = await clients.authorityClient.check(input);
  if (!authority.allowed) {
    return { outcome: "deny", stage: "authority", reason: authority.reasons.join(",") || "AuthorityDenied", authority };
  }

  const governance = await clients.governanceClient.evaluate({ ...input, authorityDecision: authority });
  if (governance.requiresApproval || governance.escalatedToTier) {
    const requiredTier = Math.max(governance.requiredApproverTier ?? 0, governance.escalatedToTier ?? 0) || 1;
    return { outcome: "approval", requiredTier, authority, governance };
  }

  if (!governance.allowed) {
    return { outcome: "deny", stage: "governance", reason: governance.violations.join(",") || "GovernanceDenied", authority, governance };
  }

  return { outcome: "allow", authority, governance };
}
