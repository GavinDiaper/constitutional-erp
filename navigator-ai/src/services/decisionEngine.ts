import { AuthorityClient } from "../clients/authorityClient";
import { GovernanceClient } from "../clients/governanceClient";
import { DecisionOutcome, NavigatorContext, RankedAction } from "../contracts/navigatorTypes";

export async function decide(input: {
  context: NavigatorContext;
  rankedActions: RankedAction[];
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
}): Promise<DecisionOutcome> {
  if (input.rankedActions.length === 0) {
    return {
      action: null,
      mode: "NO_ACTION",
      explanation: "No actions are available in the current canonical state."
    };
  }

  const top = input.rankedActions[0];
  const authority = await input.authorityClient.check({
    actorId: input.context.actorId,
    action: top.actionId,
    domain: input.context.resource.domain,
    context: {
      aggregateType: input.context.resource.type,
      aggregateId: input.context.resource.id,
      state: input.context.resource.state,
      attributes: input.context.resource.attributes
    }
  });

  if (!authority.allowed) {
    return {
      action: top,
      mode: "REJECT",
      explanation: authority.reasons?.join("; ") || "Action denied by authority engine."
    };
  }

  const governance = await input.governanceClient.evaluate({
    actorId: input.context.actorId,
    action: top.actionId,
    domain: input.context.resource.domain,
    context: {
      aggregateType: input.context.resource.type,
      aggregateId: input.context.resource.id,
      state: input.context.resource.state,
      attributes: input.context.resource.attributes
    },
    authorityDecision: authority
  });

  if (governance.mode === "REJECT") {
    return {
      action: top,
      mode: "REJECT",
      explanation: governance.reasons.join("; ") || "Action denied by governance engine."
    };
  }

  if (governance.mode === "REQUEST_APPROVAL") {
    return {
      action: top,
      mode: "REQUEST_APPROVAL",
      explanation:
        governance.reasons.join("; ") ||
        `Approval required${governance.requiredTier ? ` at tier ${governance.requiredTier}` : ""}.`
    };
  }

  return {
    action: top,
    mode: "EXECUTE",
    explanation: governance.reasons.join("; ") || "Action approved for execution."
  };
}
