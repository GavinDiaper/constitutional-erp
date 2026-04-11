import { ActionOption, CanonicalResource, SessionContext } from "../contracts/navigatorTypes";

function hasApprovalHint(link: CanonicalResource["links"][string]): boolean {
  return link.requiresApproval === true;
}

function inferRiskSignals(resource: CanonicalResource): Record<string, unknown> {
  const amount = typeof resource.attributes["amount"] === "number" ? (resource.attributes["amount"] as number) : 0;
  return {
    amount,
    highValue: amount >= 100000,
    state: resource.state
  };
}

export function interpretHypermedia(resource: CanonicalResource, ctx: SessionContext): ActionOption[] {
  const entries = Object.entries(resource.links).filter(([action]) => action !== "self");

  return entries.map(([actionId, link]) => ({
    id: actionId,
    href: link.href,
    method: link.method,
    domain: ctx.domain,
    aggregateType: ctx.aggregateType,
    aggregateId: ctx.aggregateId,
    currentState: resource.state,
    requiresApproval: hasApprovalHint(link),
    requiredTier: link.requiredTier,
    riskSignals: inferRiskSignals(resource),
    inputSchema: link.inputSchema
  }));
}
