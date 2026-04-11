import { AggregateState, LedgerEvent } from "../../contracts/canonicalTypes";

const eventTypeToState: Record<string, string> = {
  // Journal Entry
  "R2R.JournalEntryCreated": "Draft",
  "R2R.JournalEntryPosted": "Posted",
  "R2R.JournalEntryReversed": "Reversed",
  "R2R.JournalEntryAdjusted": "Adjusted",
  "R2R.JournalEntryLocked": "Locked",
  // Journal Entry – Foundation ERP lowercase format
  "R2R.journal.created": "Draft",
  "R2R.journal.posted": "Posted",
  "R2R.journal.reversed": "Reversed",
  "R2R.journal.adjusted": "Adjusted",
  "R2R.journal.locked": "Locked",
  "R2R.journal.line_added": "Draft",

  // Period
  "R2R.PeriodOpened": "Open",
  "R2R.PeriodCloseBegun": "PendingClose",
  "R2R.PeriodClosed": "Closed",
  "R2R.PeriodReopened": "Reopened",
  // Period – Foundation ERP lowercase format
  "R2R.fiscal-period.created": "Open",
  "R2R.fiscal-period.closing": "PendingClose",
  "R2R.fiscal-period.closed": "Closed",
  "R2R.fiscal-period.locked": "Locked"
};

export function applyR2REvent(state: AggregateState | null, event: LedgerEvent): AggregateState {
  const newState = eventTypeToState[event.eventType];

  if (state === null) {
    return {
      id: event.domain.aggregateId,
      domain: "R2R",
      aggregateType: event.domain.aggregateType,
      state: newState ?? "Draft",
      attributes: { ...event.payload },
      version: 1
    };
  }

  return {
    ...state,
    state: newState ?? state.state,
    attributes: { ...state.attributes, ...event.payload },
    version: state.version + 1
  };
}
