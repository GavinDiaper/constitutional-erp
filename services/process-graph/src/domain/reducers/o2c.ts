import { AggregateState, LedgerEvent } from "../../contracts/canonicalTypes";

const eventTypeToState: Record<string, string> = {
  // Quote
  "O2C.QuoteCreated": "Draft",
  "O2C.QuoteSent": "Sent",
  "O2C.QuoteAccepted": "Accepted",
  "O2C.QuoteRejected": "Rejected",
  "O2C.QuoteConvertedToOrder": "ConvertedToOrder",
  "O2C.QuoteCancelled": "Cancelled",
  "O2C.quote.created": "Draft",
  "O2C.quote.sent": "Sent",
  "O2C.quote.accepted": "Accepted",
  "O2C.quote.rejected": "Rejected",
  "O2C.quote.convertedtoorder": "ConvertedToOrder",
  "O2C.quote.cancelled": "Cancelled",

  // Sales Order
  "O2C.SalesOrderCreated": "Draft",
  "O2C.SalesOrderConfirmed": "Confirmed",
  "O2C.SalesOrderAllocated": "Allocated",
  "O2C.SalesOrderShipped": "Shipped",
  "O2C.SalesOrderPartiallyShipped": "PartiallyShipped",
  "O2C.SalesOrderFullyShipped": "FullyShipped",
  "O2C.SalesOrderInvoiced": "Invoiced",
  "O2C.SalesOrderPaid": "Paid",
  "O2C.SalesOrderPartiallyPaid": "PartiallyPaid",
  "O2C.SalesOrderFullyPaid": "FullyPaid",
  "O2C.SalesOrderClosed": "Closed",
  "O2C.SalesOrderCancelled": "Cancelled",
  "O2C.order.created": "Draft",
  "O2C.order.confirmed": "Confirmed",
  "O2C.order.allocated": "Allocated",
  "O2C.order.shipped": "Shipped",
  "O2C.order.partiallyshipped": "PartiallyShipped",
  "O2C.order.fullyshipped": "FullyShipped",
  "O2C.order.invoiced": "Invoiced",
  "O2C.order.paid": "Paid",
  "O2C.order.partiallypaid": "PartiallyPaid",
  "O2C.order.fullypaid": "FullyPaid",
  "O2C.order.closed": "Closed",
  "O2C.order.cancelled": "Cancelled",

  // AR Invoice
  "O2C.ARInvoiceCreated": "Draft",
  "O2C.ARInvoicePosted": "Posted",
  "O2C.ARInvoicePartiallyPaid": "PartiallyPaid",
  "O2C.ARInvoiceFullyPaid": "FullyPaid",
  "O2C.ARInvoiceWrittenOff": "WrittenOff",
  "O2C.ARInvoiceCancelled": "Cancelled",
  "O2C.ar-invoice.generated": "Draft",
  "O2C.ar-invoice.posted": "Posted",
  "O2C.ar-invoice.partiallypaid": "PartiallyPaid",
  "O2C.ar-invoice.fullypaid": "FullyPaid",
  "O2C.ar-invoice.writtenoff": "WrittenOff",
  "O2C.ar-invoice.cancelled": "Cancelled",

  // AR Payment
  "O2C.ARPaymentReceived": "Received",
  "O2C.ARPaymentApplied": "Applied",
  "O2C.ARPaymentReconciled": "Reconciled",
  "O2C.ARPaymentCancelled": "Cancelled",
  "O2C.ar-payment.received": "Received",
  "O2C.ar-payment.applied": "Applied",
  "O2C.ar-payment.reconciled": "Reconciled",
  "O2C.ar-payment.cancelled": "Cancelled"
};

export function applyO2CEvent(state: AggregateState | null, event: LedgerEvent): AggregateState {
  const newState = eventTypeToState[event.eventType];
  const isKnownStateEvent = typeof newState === "string";

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
    // Ignore non-domain state events (for example Mesh.ActionAllowed) during O2C replay.
    attributes: isKnownStateEvent ? { ...state.attributes, ...event.payload } : state.attributes,
    version: state.version + 1
  };
}
