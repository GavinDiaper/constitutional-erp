import { CanonicalDomain, CanonicalTransition } from "../../contracts/canonicalTypes";
import { h2rTransitions } from "./h2r";
import { o2cTransitions } from "./o2c";
import { p2pTransitions } from "./p2p";
import { r2rTransitions } from "./r2r";

const allTransitions: CanonicalTransition[] = [
  ...p2pTransitions,
  ...o2cTransitions,
  ...r2rTransitions,
  ...h2rTransitions
];

const byId = new Map<string, CanonicalTransition>(allTransitions.map((t) => [t.id, t]));

/** All transitions defined for a given aggregate type */
export function getTransitionsForAggregate(domain: CanonicalDomain, aggregateType: string): CanonicalTransition[] {
  return allTransitions.filter((t) => t.domain === domain && t.aggregateType === aggregateType);
}

/** Transitions whose fromStates include the supplied current state */
export function getAvailableTransitions(
  domain: CanonicalDomain,
  aggregateType: string,
  currentState: string
): CanonicalTransition[] {
  return getTransitionsForAggregate(domain, aggregateType).filter((t) => t.fromStates.includes(currentState));
}

/** Find the specific transition for an action, or undefined if none exists */
export function findTransition(
  domain: CanonicalDomain,
  aggregateType: string,
  action: string
): CanonicalTransition | undefined {
  return allTransitions.find((t) => t.domain === domain && t.aggregateType === aggregateType && t.action === action);
}

/** True when the domain+aggregateType combo has any registered transitions */
export function isKnownAggregateType(domain: CanonicalDomain, aggregateType: string): boolean {
  return allTransitions.some((t) => t.domain === domain && t.aggregateType === aggregateType);
}

export function resolveTransitionById(id: string): CanonicalTransition | undefined {
  return byId.get(id);
}
