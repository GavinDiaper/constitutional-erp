import { AggregateState, CanonicalDomain, LedgerEvent } from "../../contracts/canonicalTypes";
import { applyH2REvent } from "./h2r";
import { applyINVEvent } from "./inv";
import { applyO2CEvent } from "./o2c";
import { applyP2PEvent } from "./p2p";
import { applyR2REvent } from "./r2r";

type EventReducer = (state: AggregateState | null, event: LedgerEvent) => AggregateState;

const reducers: Record<CanonicalDomain, EventReducer> = {
  P2P: applyP2PEvent,
  O2C: applyO2CEvent,
  R2R: applyR2REvent,
  H2R: applyH2REvent,
  INV: applyINVEvent
};

/**
 * Rebuilds aggregate state by replaying a sequence of ledger events in order.
 * Returns null when the event stream is empty (aggregate not found).
 */
export function replayEvents(domain: CanonicalDomain, events: LedgerEvent[]): AggregateState | null {
  const reducer = reducers[domain];

  let state: AggregateState | null = null;
  for (const event of events) {
    state = reducer(state, event);
  }

  return state;
}
