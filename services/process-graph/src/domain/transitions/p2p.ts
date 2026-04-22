import { CanonicalTransition } from "../../contracts/canonicalTypes";

export const p2pTransitions: CanonicalTransition[] = [
  // ── Requisition ────────────────────────────────────────────────────────────
  {
    id: "P2P.Requisition.submit",
    domain: "P2P",
    aggregateType: "requisition",
    fromStates: ["Draft"],
    toStates: ["Submitted"],
    action: "submit"
  },
  {
    id: "P2P.Requisition.approve",
    domain: "P2P",
    aggregateType: "requisition",
    fromStates: ["Submitted"],
    toStates: ["Approved"],
    action: "approve"
  },
  {
    id: "P2P.Requisition.reject",
    domain: "P2P",
    aggregateType: "requisition",
    fromStates: ["Submitted"],
    toStates: ["Rejected"],
    action: "reject"
  },
  {
    id: "P2P.Requisition.convertToPO",
    domain: "P2P",
    aggregateType: "requisition",
    fromStates: ["Approved"],
    toStates: ["ConvertedToPO"],
    action: "convertToPO"
  },
  {
    id: "P2P.Requisition.cancel",
    domain: "P2P",
    aggregateType: "requisition",
    fromStates: ["Draft", "Submitted", "Approved"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── Purchase Order ─────────────────────────────────────────────────────────
  {
    id: "P2P.PurchaseOrder.approve",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["Draft"],
    toStates: ["Approved"],
    action: "approve"
  },
  {
    id: "P2P.PurchaseOrder.send",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["Approved"],
    toStates: ["Issued"],
    action: "send"
  },
  {
    id: "P2P.PurchaseOrder.acknowledge",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["Issued"],
    toStates: ["Acknowledged"],
    action: "acknowledge"
  },
  {
    id: "P2P.PurchaseOrder.receive",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["Issued", "Acknowledged", "PartiallyReceived"],
    toStates: ["PartiallyReceived", "FullyReceived"],
    action: "receive"
  },
  {
    id: "P2P.PurchaseOrder.invoice",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["FullyReceived"],
    toStates: ["Invoiced"],
    action: "invoice"
  },
  {
    id: "P2P.PurchaseOrder.close",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["FullyPaid"],
    toStates: ["Closed"],
    action: "close"
  },
  {
    id: "P2P.PurchaseOrder.cancel",
    domain: "P2P",
    aggregateType: "purchase-order",
    fromStates: ["Draft", "Approved", "Issued", "Acknowledged"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── Goods Receipt ─────────────────────────────────────────────────────────
  {
    id: "P2P.GoodsReceipt.receive",
    domain: "P2P",
    aggregateType: "goods-receipt",
    fromStates: ["Draft"],
    toStates: ["Received"],
    action: "receive_goods"
  },
  {
    id: "P2P.GoodsReceipt.accept",
    domain: "P2P",
    aggregateType: "goods-receipt",
    fromStates: ["Received"],
    toStates: ["Accepted"],
    action: "accept_goods"
  },

  // ── Supplier Invoice ───────────────────────────────────────────────────────
  {
    id: "P2P.SupplierInvoice.validate",
    domain: "P2P",
    aggregateType: "supplier-invoice",
    fromStates: ["Draft"],
    toStates: ["Validated"],
    action: "validate"
  },
  {
    id: "P2P.SupplierInvoice.post",
    domain: "P2P",
    aggregateType: "supplier-invoice",
    fromStates: ["Validated"],
    toStates: ["Posted"],
    action: "post"
  },
  {
    id: "P2P.SupplierInvoice.applyPayment",
    domain: "P2P",
    aggregateType: "supplier-invoice",
    fromStates: ["Posted", "PartiallyPaid"],
    toStates: ["PartiallyPaid", "FullyPaid"],
    action: "applyPayment"
  },
  {
    id: "P2P.SupplierInvoice.cancel",
    domain: "P2P",
    aggregateType: "supplier-invoice",
    fromStates: ["Draft", "Validated"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── AP Payment ─────────────────────────────────────────────────────────────
  {
    id: "P2P.APPayment.approvePayment",
    domain: "P2P",
    aggregateType: "ap-payment",
    fromStates: ["Initiated"],
    toStates: ["Approved"],
    action: "approvePayment"
  },
  {
    id: "P2P.APPayment.executePayment",
    domain: "P2P",
    aggregateType: "ap-payment",
    fromStates: ["Approved"],
    toStates: ["Executed"],
    action: "executePayment"
  },
  {
    id: "P2P.APPayment.reconcilePayment",
    domain: "P2P",
    aggregateType: "ap-payment",
    fromStates: ["Executed"],
    toStates: ["Reconciled"],
    action: "reconcilePayment"
  },
  {
    id: "P2P.APPayment.cancel",
    domain: "P2P",
    aggregateType: "ap-payment",
    fromStates: ["Initiated", "Approved"],
    toStates: ["Cancelled"],
    action: "cancel"
  },

  // ── Supplier ───────────────────────────────────────────────────────────────
  {
    id: "P2P.Supplier.activate",
    domain: "P2P",
    aggregateType: "supplier",
    fromStates: ["Draft"],
    toStates: ["Active"],
    action: "activate"
  },
  {
    id: "P2P.Supplier.suspend",
    domain: "P2P",
    aggregateType: "supplier",
    fromStates: ["Active"],
    toStates: ["Suspended"],
    action: "suspend"
  },
  {
    id: "P2P.Supplier.reactivate",
    domain: "P2P",
    aggregateType: "supplier",
    fromStates: ["Suspended"],
    toStates: ["Active"],
    action: "reactivate"
  },
  {
    id: "P2P.Supplier.deactivate",
    domain: "P2P",
    aggregateType: "supplier",
    fromStates: ["Active", "Suspended"],
    toStates: ["Inactive"],
    action: "deactivate"
  }
];
