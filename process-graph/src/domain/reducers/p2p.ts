import { AggregateState, LedgerEvent } from "../../contracts/canonicalTypes";

// Maps canonical event type → new canonical state for P2P aggregates.
// The first event in a stream (a "Created" variant) initialises the aggregate.

const eventTypeToState: Record<string, string> = {
  // Requisition
  "P2P.RequisitionCreated": "Draft",
  "P2P.RequisitionSubmitted": "Submitted",
  "P2P.RequisitionApproved": "Approved",
  "P2P.RequisitionRejected": "Rejected",
  "P2P.RequisitionConvertedToPO": "ConvertedToPO",
  "P2P.RequisitionCancelled": "Cancelled",
  // Requisition – Foundation ERP lowercase format
  "P2P.requisition.created": "Draft",
  "P2P.requisition.submitted": "Submitted",
  "P2P.requisition.approved": "Approved",
  "P2P.requisition.rejected": "Rejected",
  "P2P.requisition.converted": "ConvertedToPO",
  "P2P.requisition.cancelled": "Cancelled",

  // Purchase Order
  "P2P.PurchaseOrderCreated": "Draft",
  "P2P.PurchaseOrderIssued": "Issued",
  "P2P.PurchaseOrderAcknowledged": "Acknowledged",
  "P2P.PurchaseOrderPartiallyReceived": "PartiallyReceived",
  "P2P.PurchaseOrderFullyReceived": "FullyReceived",
  "P2P.PurchaseOrderInvoiced": "Invoiced",
  "P2P.PurchaseOrderPartiallyPaid": "PartiallyPaid",
  "P2P.PurchaseOrderFullyPaid": "FullyPaid",
  "P2P.PurchaseOrderClosed": "Closed",
  "P2P.PurchaseOrderCancelled": "Cancelled",
  // Purchase Order – Foundation ERP lowercase format
  "P2P.po.created": "Draft",
  "P2P.po.approved": "Approved",
  "P2P.po.sent": "Issued",
  "P2P.po.received.partial": "PartiallyReceived",
  "P2P.po.received.full": "FullyReceived",
  "P2P.po.closed": "Closed",
  "P2P.po.cancelled": "Cancelled",

  // Supplier Invoice
  "P2P.SupplierInvoiceCreated": "Draft",
  "P2P.SupplierInvoiceValidated": "Validated",
  "P2P.SupplierInvoicePosted": "Posted",
  "P2P.SupplierInvoicePartiallyPaid": "PartiallyPaid",
  "P2P.SupplierInvoiceFullyPaid": "FullyPaid",
  "P2P.SupplierInvoiceCancelled": "Cancelled",

  // AP Payment
  "P2P.APPaymentInitiated": "Initiated",
  "P2P.APPaymentApproved": "Approved",
  "P2P.APPaymentExecuted": "Executed",
  "P2P.APPaymentReconciled": "Reconciled",
  "P2P.APPaymentCancelled": "Cancelled"
};

export function applyP2PEvent(state: AggregateState | null, event: LedgerEvent): AggregateState {
  const newState = eventTypeToState[event.eventType];

  if (state === null) {
    // First event initialises the aggregate
    return {
      id: event.domain.aggregateId,
      domain: "P2P",
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
