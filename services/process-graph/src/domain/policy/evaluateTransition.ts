import { AggregateState, CanonicalDomain, PolicyOutcome } from "../../contracts/canonicalTypes";
import { checkAuthority } from "../../clients/authorityClient";
import { evaluateGovernance } from "../../clients/governanceClient";

/**
 * Builds the governance context from aggregate attributes + request payload.
 * Satisfies the domain-specific context schemas in Governance Engine.
 */
function buildGovernanceContext(
  domain: CanonicalDomain,
  aggregate: AggregateState,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const attrs = aggregate.attributes;

  // requesterId is always the actor – supplied by the call-site
  const base = {
    requesterId: payload["actorId"] ?? attrs["requesterId"] ?? attrs["actorId"] ?? "",
    amount: Number(payload["amount"] ?? attrs["totalAmount"] ?? attrs["amount"] ?? 0),
    currency: String(payload["currency"] ?? attrs["currency"] ?? "USD")
  };

  switch (domain) {
    case "P2P":
      return { ...base, credentialType: payload["credentialType"] ?? attrs["credentialType"] };

    case "O2C":
      return {
        ...base,
        customerRisk: payload["customerRisk"] ?? attrs["customerRisk"],
        credentialType: payload["credentialType"] ?? attrs["credentialType"]
      };

    case "R2R":
      return {
        ...base,
        journalType: String(payload["journalType"] ?? attrs["journalType"] ?? "standard"),
        credentialType: payload["credentialType"] ?? attrs["credentialType"]
      };

    case "H2R":
      return {
        requesterId: base.requesterId,
        employeeId: String(payload["employeeId"] ?? attrs["id"] ?? aggregate.id),
        credentialType: payload["credentialType"] ?? attrs["credentialType"]
      };

    case "INV":
      return {
        ...base,
        skuId: String(payload["skuId"] ?? attrs["skuId"] ?? aggregate.id),
        organizationId: payload["organizationId"] ?? attrs["organizationId"],
        movementType: payload["movementType"] ?? attrs["movementType"],
        credentialType: payload["credentialType"] ?? attrs["credentialType"]
      };
  }
}

/**
 * Evaluates whether an actor may perform a transition on an aggregate.
 * Calls Authority Engine then Governance Engine and folds the results
 * into a single PolicyOutcome.
 */
export async function evaluateTransition(input: {
  actorId: string;
  action: string;
  domain: CanonicalDomain;
  aggregate: AggregateState;
  payload: Record<string, unknown>;
}): Promise<PolicyOutcome> {
  const { actorId, action, domain, aggregate, payload } = input;

  const context = buildGovernanceContext(domain, aggregate, { ...payload, actorId });

  // Step 1 – authority check
  const authority = await checkAuthority({ actorId, action, domain, context });

  if (!authority.allowed) {
    return { kind: "denied", reasons: authority.reasons };
  }

  // Step 2 – governance check
  const governance = await evaluateGovernance({
    actorId,
    action,
    domain,
    context,
    authorityDecision: authority
  });

  if (!governance.allowed) {
    return { kind: "denied", reasons: governance.violations };
  }

  if (governance.requiresApproval) {
    return {
      kind: "requiresApproval",
      requiredTier: governance.requiredApproverTier ?? 1,
      reasons: governance.constraints
    };
  }

  return { kind: "allowed", effectiveTier: authority.effectiveTier ?? 0 };
}
