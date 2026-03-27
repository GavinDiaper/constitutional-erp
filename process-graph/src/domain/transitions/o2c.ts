import { CanonicalTransition } from "../../contracts/canonicalTypes";

export const o2cTransitions: CanonicalTransition[] = [
  // ── Quote ──────────────────────────────────────────────────────────────────
  {
    id: "O2C.Quote.send",
    domain: "O2C",
    aggregateType: "quote",
    fromStates: ["Draft"],
    toStates: ["Sent"],
    action: "send"
  },
  {
    id: "O2C.Quote.accept",
    domain: "O2C",
    aggregateType: "quote",
    fromStates: ["Sent"],
    toStates: ["Accepted"],
    action: "accept"
  },
  {
    id: "O2C.Quote.reject",
    domain: "O2C",
    aggregateType: "quote",
    fromStates: ["Sent"],
    toStates: ["Rejected"],
    action: "reject"
  },
  {
    id: "O2C.Quote.convertToOrder",
    domain: "O2C",
    aggregateType: "quote",
    fromStates: ["Accepted"],
    toStates: ["ConvertedToOrder"],
    action: "convertToOrder"
  },
  {
    id: "O2C.Quote.cancel",
    domain: "O2C",
    aggregateType: "quote",
    fromStates: ["Draft", "Sent", "Accepted"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── Sales Order ────────────────────────────────────────────────────────────
  {
    id: "O2C.SalesOrder.confirm",
    domain: "O2C",
    aggregateType: "sales-order",
    fromStates: ["Draft"],
    toStates: ["Confirmed"],
    action: "confirm"
  },
  {
    id: "O2C.SalesOrder.allocate",
    domain: "O2C",
    aggregateType: "sales-order",
    fromStates: ["Confirmed"],
    toStates: ["Allocated"],
    action: "allocate"
  },
  {
    id: "O2C.SalesOrder.ship",
    domain: "O2C",
    aggregateType: "sales-order",
    fromStates: ["Allocated", "PartiallyShipped"],
    toStates: ["PartiallyShipped", "FullyShipped"],
    action: "ship"
  },
  {
    id: "O2C.SalesOrder.invoice",
    domain: "O2C",
    aggregateType: "sales-order",
    fromStates: ["FullyShipped"],
    toStates: ["Invoiced"],
    action: "invoice"
  },
  {
    id: "O2C.SalesOrder.close",
    domain: "O2C",
    aggregateType: "sales-order",
    fromStates: ["FullyPaid"],
    toStates: ["Closed"],
    action: "close"
  },
  {
    id: "O2C.SalesOrder.cancel",
    domain: "O2C",
    aggregateType: "sales-order",
    fromStates: ["Draft", "Confirmed", "Allocated"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── AR Invoice ─────────────────────────────────────────────────────────────
  {
    id: "O2C.ARInvoice.post",
    domain: "O2C",
    aggregateType: "ar-invoice",
    fromStates: ["Draft"],
    toStates: ["Posted"],
    action: "post"
  },
  {
    id: "O2C.ARInvoice.applyPayment",
    domain: "O2C",
    aggregateType: "ar-invoice",
    fromStates: ["Posted", "PartiallyPaid"],
    toStates: ["PartiallyPaid", "FullyPaid"],
    action: "applyPayment"
  },
  {
    id: "O2C.ARInvoice.writeOff",
    domain: "O2C",
    aggregateType: "ar-invoice",
    fromStates: ["Posted", "PartiallyPaid"],
    toStates: ["WrittenOff"],
    action: "writeOff"
  },
  {
    id: "O2C.ARInvoice.cancel",
    domain: "O2C",
    aggregateType: "ar-invoice",
    fromStates: ["Draft"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── AR Payment ─────────────────────────────────────────────────────────────
  {
    id: "O2C.ARPayment.apply",
    domain: "O2C",
    aggregateType: "ar-payment",
    fromStates: ["Received"],
    toStates: ["Applied"],
    action: "apply"
  },
  {
    id: "O2C.ARPayment.reconcile",
    domain: "O2C",
    aggregateType: "ar-payment",
    fromStates: ["Applied"],
    toStates: ["Reconciled"],
    action: "reconcile"
  },
  {
    id: "O2C.ARPayment.cancel",
    domain: "O2C",
    aggregateType: "ar-payment",
    fromStates: ["Received", "Applied"],
    toStates: ["Cancelled"],
    action: "cancel"
  }
];
