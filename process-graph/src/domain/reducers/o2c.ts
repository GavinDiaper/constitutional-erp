import { AggregateState, LedgerEvent } from "../../contracts/canonicalTypes";

const eventTypeToState: Record<string, string> = {
  // Quote
  "O2C.QuoteCreated": "Draft",
  "O2C.QuoteSent": "Sent",
  "O2C.QuoteAccepted": "Accepted",
  "O2C.QuoteRejected": "Rejected",
  "O2C.QuoteConvertedToOrder": "ConvertedToOrder",
  "O2C.QuoteCancelled": "Cancelled",

  // Sales Order
  "O2C.SalesOrderCreated": "Draft",
  "O2C.SalesOrderConfirmed": "Confirmed",
  "O2C.SalesOrderAllocated": "Allocated",
  "O2C.SalesOrderPartiallyShipped": "PartiallyShipped",
  "O2C.SalesOrderFullyShipped": "FullyShipped",
  "O2C.SalesOrderInvoiced": "Invoiced",
  "O2C.SalesOrderPartiallyPaid": "PartiallyPaid",
  "O2C.SalesOrderFullyPaid": "FullyPaid",
  "O2C.SalesOrderClosed": "Closed",
  "O2C.SalesOrderCancelled": "Cancelled",

  // AR Invoice
  "O2C.ARInvoiceCreated": "Draft",
  "O2C.ARInvoicePosted": "Posted",
  "O2C.ARInvoicePartiallyPaid": "PartiallyPaid",
  "O2C.ARInvoiceFullyPaid": "FullyPaid",
  "O2C.ARInvoiceWrittenOff": "WrittenOff",
  "O2C.ARInvoiceCancelled": "Cancelled",

  // AR Payment
  "O2C.ARPaymentReceived": "Received",
  "O2C.ARPaymentApplied": "Applied",
  "O2C.ARPaymentReconciled": "Reconciled",
  "O2C.ARPaymentCancelled": "Cancelled"
};

export function applyO2CEvent(state: AggregateState | null, event: LedgerEvent): AggregateState {
  const newState = eventTypeToState[event.eventType];

  if (state === null) {
    return {
      id: event.domain.aggregateId,
      domain: "O2C",
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
