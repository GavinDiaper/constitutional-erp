import { AggregateState, LedgerEvent } from "../../contracts/canonicalTypes";

const eventTypeToState: Record<string, string> = {
  "INV.inv.item.created": "Defined",
  "INV.inv.organization.created": "Configured",
  "INV.inv.receipt.posted": "Received",
  "INV.inv.issue.posted": "Issued",
  "INV.inv.adjustment.posted": "Adjusted",
  "INV.inv.cost.updated": "CostUpdated",
  "INV.item.created": "Defined",
  "INV.organization.created": "Configured",
  "INV.receipt.posted": "Received",
  "INV.issue.posted": "Issued",
  "INV.adjustment.posted": "Adjusted",
  "INV.cost.updated": "CostUpdated"
};

export function applyINVEvent(state: AggregateState | null, event: LedgerEvent): AggregateState {
  const newState = eventTypeToState[event.eventType];
  const isKnownStateEvent = typeof newState === "string";

  if (state === null) {
    return {
      id: event.domain.aggregateId,
      domain: "INV",
      aggregateType: event.domain.aggregateType,
      state: newState ?? "Draft",
      attributes: { ...event.payload },
      version: 1
    };
  }

  return {
    ...state,
    state: newState ?? state.state,
    attributes: isKnownStateEvent ? { ...state.attributes, ...event.payload } : state.attributes,
    version: state.version + 1
  };
}
