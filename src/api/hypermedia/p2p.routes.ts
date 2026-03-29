import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import {
  createRequisition,
  getRequisitionById,
  listRequisitions,
  submitRequisition,
  approveRequisition,
  rejectRequisition,
  cancelRequisition
} from "../../domain/p2p/requisition/requisitionService";
import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  activateSupplier,
  suspendSupplier
} from "../../domain/p2p/supplier/supplierService";
import {
  createPurchaseOrder,
  createPurchaseOrderFromRequisition,
  getPurchaseOrderById,
  listPurchaseOrders,
  approvePurchaseOrder,
  sendPurchaseOrder,
  receiveGoods,
  closePurchaseOrder,
  cancelPurchaseOrder
} from "../../domain/p2p/purchaseOrder/purchaseOrderService";
import {
  createGoodsReceipt,
  getGoodsReceiptById,
  listGoodsReceipts,
  updateGoodsReceiptState
} from "../../domain/p2p/receipt/goodsReceiptService";
import {
  createSupplierInvoiceFromReceipt,
  getSupplierInvoiceById,
  listSupplierInvoices,
  validateInvoice,
  postInvoice,
  cancelInvoice
} from "../../domain/p2p/invoice/supplierInvoiceService";
import {
  createApPayment,
  getApPaymentById,
  listApPayments,
  receiveApPayment,
  applyApPayment,
  reconcileApPayment,
  cancelApPayment
} from "../../domain/p2p/payment/apPaymentService";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createRequisitionSchema = z.object({
  requester: z.string().min(1),
  department: z.string().optional(),
  currencyCode: z.string().optional(),
  neededByDate: z.string().optional()
});

const createSupplierSchema = z.object({
  supplierName: z.string().min(1),
  email: z.string().email().optional(),
  paymentTerms: z.string().optional(),
  taxId: z.string().optional(),
  currencyCode: z.string().optional()
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  requisitionId: z.string().min(1).optional(),
  totalAmount: z.number().nonnegative().optional(),
  currencyCode: z.string().optional(),
  deliveryAddress: z.string().optional()
});

const createReceiptSchema = z.object({
  poId: z.string().min(1)
});

const receiveGoodsSchema = z.object({
  isPartial: z.boolean().optional()
});

const createSupplierInvoiceSchema = z.object({
  receiptId: z.string().min(1),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  currencyCode: z.string().optional()
});

const createApPaymentSchema = z.object({
  supplierInvoiceId: z.string().min(1),
  amount: z.number().positive(),
  currencyCode: z.string().optional(),
  method: z.string().optional()
});

const convertRequisitionSchema = z.object({
  supplierId: z.string().min(1)
});

// ── HATEOAS link builders ─────────────────────────────────────────────────────

function supplierLinks(supplierId: string, status: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/suppliers/${supplierId}`, method: "GET" }
  };
  if (status === "Draft") {
    links["activate"] = { href: `/api/v1/p2p/suppliers/${supplierId}/activate`, method: "POST", mcpFunction: "p2p_activate_supplier" };
  }
  if (status === "Active") {
    links["suspend"] = { href: `/api/v1/p2p/suppliers/${supplierId}/suspend`, method: "POST", mcpFunction: "p2p_suspend_supplier" };
  }
  return links;
}

function requisitionLinks(requisitionId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/requisitions/${requisitionId}`, method: "GET" }
  };
  if (state === "Draft") {
    links["submit"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/submit`, method: "POST", mcpFunction: "p2p_submit_requisition" };
    links["cancel"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_requisition" };
  }
  if (state === "Submitted") {
    links["approve"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/approve`, method: "POST", mcpFunction: "p2p_approve_requisition" };
    links["reject"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/reject`, method: "POST", mcpFunction: "p2p_reject_requisition" };
    links["cancel"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_requisition" };
  }
  if (state === "Approved") {
    links["convert-to-po"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/convert`, method: "POST", mcpFunction: "p2p_convert_requisition_to_po" };
    links["cancel"] = { href: `/api/v1/p2p/requisitions/${requisitionId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_requisition" };
  }
  return links;
}

function purchaseOrderLinks(poId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/purchase-orders/${poId}`, method: "GET" }
  };
  if (state === "Draft") {
    links["approve"] = { href: `/api/v1/p2p/purchase-orders/${poId}/approve`, method: "POST", mcpFunction: "p2p_approve_po" };
    links["cancel"] = { href: `/api/v1/p2p/purchase-orders/${poId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_po" };
  }
  if (state === "Approved") {
    links["send"] = { href: `/api/v1/p2p/purchase-orders/${poId}/send`, method: "POST", mcpFunction: "p2p_send_po" };
    links["cancel"] = { href: `/api/v1/p2p/purchase-orders/${poId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_po" };
  }
  if (state === "Sent" || state === "PartiallyReceived") {
    links["receive-goods"] = { href: `/api/v1/p2p/purchase-orders/${poId}/receive-goods`, method: "POST", mcpFunction: "p2p_receive_goods_on_po" };
    links["cancel"] = { href: `/api/v1/p2p/purchase-orders/${poId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_po" };
  }
  if (state === "PartiallyReceived" || state === "FullyReceived") {
    links["close"] = { href: `/api/v1/p2p/purchase-orders/${poId}/close`, method: "POST", mcpFunction: "p2p_close_po" };
  }
  return links;
}

function goodsReceiptLinks(receiptId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/goods-receipts/${receiptId}`, method: "GET" }
  };
  if (state === "Draft") {
    links["receive"] = { href: `/api/v1/p2p/goods-receipts/${receiptId}/receive`, method: "POST", mcpFunction: "p2p_goods_receipt_receive" };
  }
  if (state === "Received") {
    links["accept"] = { href: `/api/v1/p2p/goods-receipts/${receiptId}/accept`, method: "POST", mcpFunction: "p2p_goods_receipt_accept" };
  }
  if (state === "Accepted") {
    links["create-supplier-invoice"] = { href: "/api/v1/p2p/supplier-invoices", method: "POST", mcpFunction: "p2p_create_supplier_invoice" };
  }
  return links;
}

function supplierInvoiceLinks(supplierInvoiceId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}`, method: "GET" }
  };
  if (state === "Draft") {
    links["validate"] = { href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}/validate`, method: "POST", mcpFunction: "p2p_validate_invoice" };
    links["cancel"] = { href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_invoice" };
  }
  if (state === "Validated") {
    links["post"] = { href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}/post`, method: "POST", mcpFunction: "p2p_post_supplier_invoice" };
    links["cancel"] = { href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_invoice" };
  }
  return links;
}

function apPaymentLinks(apPaymentId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/ap-payments/${apPaymentId}`, method: "GET" }
  };
  if (state === "Draft") {
    links["receive"] = { href: `/api/v1/p2p/ap-payments/${apPaymentId}/receive`, method: "POST", mcpFunction: "p2p_receive_ap_payment" };
    links["cancel"] = { href: `/api/v1/p2p/ap-payments/${apPaymentId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_ap_payment" };
  }
  if (state === "Received") {
    links["apply"] = { href: `/api/v1/p2p/ap-payments/${apPaymentId}/apply`, method: "POST", mcpFunction: "p2p_apply_ap_payment" };
    links["cancel"] = { href: `/api/v1/p2p/ap-payments/${apPaymentId}/cancel`, method: "POST", mcpFunction: "p2p_cancel_ap_payment" };
  }
  if (state === "Applied") {
    links["reconcile"] = { href: `/api/v1/p2p/ap-payments/${apPaymentId}/reconcile`, method: "POST", mcpFunction: "p2p_reconcile_ap_payment" };
  }
  return links;
}

export const p2pRouter = Router();

// ── Supplier routes ──────────────────────────────────────────────────────────

p2pRouter.get("/suppliers", (_req, res) => {
  const suppliers = listSuppliers().map((row: any) => entityWithLinks(row, supplierLinks(row.supplier_id, row.status)));
  res.json({ data: suppliers });
});

p2pRouter.get("/suppliers/:supplierId", (req, res) => {
  const supplier = getSupplierById(req.params.supplierId);
  res.json(entityWithLinks(supplier as any, supplierLinks(req.params.supplierId, (supplier as any).status)));
});

p2pRouter.post("/suppliers", validateBody(createSupplierSchema), (req, res) => {
  const supplier = createSupplier(req.body, req.actor);
  res.status(201).json(entityWithLinks(supplier as any, supplierLinks((supplier as any).supplier_id, (supplier as any).status)));
});

p2pRouter.post("/suppliers/:supplierId/activate", (req, res) => {
  const supplier = activateSupplier(req.params.supplierId, req.actor);
  res.json(entityWithLinks(supplier as any, supplierLinks(req.params.supplierId, (supplier as any).status)));
});

p2pRouter.post("/suppliers/:supplierId/suspend", (req, res) => {
  const supplier = suspendSupplier(req.params.supplierId, req.actor);
  res.json(entityWithLinks(supplier as any, supplierLinks(req.params.supplierId, (supplier as any).status)));
});

// ── Requisition routes ───────────────────────────────────────────────────────

p2pRouter.get("/requisitions", (_req, res) => {
  const requisitions = listRequisitions().map((row: any) => entityWithLinks(row, requisitionLinks(row.requisition_id, row.state)));
  res.json({ data: requisitions });
});

p2pRouter.get("/requisitions/:requisitionId", (req, res) => {
  const requisition = getRequisitionById(req.params.requisitionId);
  res.json(entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state)));
});

p2pRouter.post("/requisitions", validateBody(createRequisitionSchema), (req, res) => {
  const requisition = createRequisition(req.body, req.actor);
  res.status(201).json(entityWithLinks(requisition as any, requisitionLinks((requisition as any).requisition_id, (requisition as any).state)));
});

p2pRouter.post("/requisitions/:requisitionId/submit", (req, res) => {
  const requisition = submitRequisition(req.params.requisitionId, req.actor);
  res.json(entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state)));
});

p2pRouter.post("/requisitions/:requisitionId/approve", (req, res) => {
  const requisition = approveRequisition(req.params.requisitionId, req.actor);
  res.json(entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state)));
});

p2pRouter.post("/requisitions/:requisitionId/reject", (req, res) => {
  const requisition = rejectRequisition(req.params.requisitionId, req.actor);
  res.json(entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state)));
});

p2pRouter.post("/requisitions/:requisitionId/cancel", (req, res) => {
  const requisition = cancelRequisition(req.params.requisitionId, req.actor);
  res.json(entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state)));
});

p2pRouter.post("/requisitions/:requisitionId/convert", validateBody(convertRequisitionSchema), (req, res) => {
  const po = createPurchaseOrderFromRequisition({ requisitionId: req.params.requisitionId, supplierId: req.body.supplierId }, req.actor);
  res.status(201).json(entityWithLinks(po as any, purchaseOrderLinks((po as any).po_id, (po as any).state)));
});

// ── Purchase Order routes ────────────────────────────────────────────────────

p2pRouter.get("/purchase-orders", (_req, res) => {
  const rows = listPurchaseOrders().map((row: any) => entityWithLinks(row, purchaseOrderLinks(row.po_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/purchase-orders/:poId", (req, res) => {
  const po = getPurchaseOrderById(req.params.poId);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders", validateBody(createPurchaseOrderSchema), (req, res) => {
  const po = createPurchaseOrder(req.body, req.actor);
  res.status(201).json(entityWithLinks(po as any, purchaseOrderLinks((po as any).po_id, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/approve", (req, res) => {
  const po = approvePurchaseOrder(req.params.poId, req.actor);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/send", (req, res) => {
  const po = sendPurchaseOrder(req.params.poId, req.actor);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/receive-goods", validateBody(receiveGoodsSchema), (req, res) => {
  const po = receiveGoods(req.params.poId, req.body.isPartial ?? false, req.actor);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/close", (req, res) => {
  const po = closePurchaseOrder(req.params.poId, req.actor);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/cancel", (req, res) => {
  const po = cancelPurchaseOrder(req.params.poId, req.actor);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

// ── Goods Receipt routes ─────────────────────────────────────────────────────

p2pRouter.get("/goods-receipts", (_req, res) => {
  const rows = listGoodsReceipts().map((row: any) => entityWithLinks(row, goodsReceiptLinks(row.receipt_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/goods-receipts/:receiptId", (req, res) => {
  const receipt = getGoodsReceiptById(req.params.receiptId);
  res.json(entityWithLinks(receipt as any, goodsReceiptLinks(req.params.receiptId, (receipt as any).state)));
});

p2pRouter.post("/goods-receipts", validateBody(createReceiptSchema), (req, res) => {
  const receipt = createGoodsReceipt(req.body.poId, req.actor);
  res.status(201).json(entityWithLinks(receipt as any, goodsReceiptLinks((receipt as any).receipt_id, (receipt as any).state)));
});

p2pRouter.post("/goods-receipts/:receiptId/receive", (req, res) => {
  const receipt = updateGoodsReceiptState(req.params.receiptId, "Received", {}, req.actor);
  res.json(entityWithLinks(receipt as any, goodsReceiptLinks(req.params.receiptId, (receipt as any).state)));
});

p2pRouter.post("/goods-receipts/:receiptId/accept", validateBody(z.object({ isPartial: z.boolean().optional() })), (req, res) => {
  const receipt = updateGoodsReceiptState(req.params.receiptId, "Accepted", { isPartial: req.body.isPartial }, req.actor);
  res.json(entityWithLinks(receipt as any, goodsReceiptLinks(req.params.receiptId, (receipt as any).state)));
});

// ── Supplier Invoice routes ──────────────────────────────────────────────────

p2pRouter.get("/supplier-invoices", (_req, res) => {
  const rows = listSupplierInvoices().map((row: any) => entityWithLinks(row, supplierInvoiceLinks(row.supplier_invoice_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/supplier-invoices/:supplierInvoiceId", (req, res) => {
  const supplierInvoice = getSupplierInvoiceById(req.params.supplierInvoiceId);
  res.json(entityWithLinks(supplierInvoice as any, supplierInvoiceLinks(req.params.supplierInvoiceId, (supplierInvoice as any).state)));
});

p2pRouter.post("/supplier-invoices", validateBody(createSupplierInvoiceSchema), (req, res) => {
  const { receiptId, ...opts } = req.body;
  const supplierInvoice = createSupplierInvoiceFromReceipt(receiptId, opts, req.actor);
  res.status(201).json(entityWithLinks(supplierInvoice as any, supplierInvoiceLinks((supplierInvoice as any).supplier_invoice_id, (supplierInvoice as any).state)));
});

p2pRouter.post("/supplier-invoices/:supplierInvoiceId/validate", (req, res) => {
  const supplierInvoice = validateInvoice(req.params.supplierInvoiceId, req.actor);
  res.json(entityWithLinks(supplierInvoice as any, supplierInvoiceLinks(req.params.supplierInvoiceId, (supplierInvoice as any).state)));
});

p2pRouter.post("/supplier-invoices/:supplierInvoiceId/post", (req, res) => {
  const supplierInvoice = postInvoice(req.params.supplierInvoiceId, req.actor);
  res.json(entityWithLinks(supplierInvoice as any, supplierInvoiceLinks(req.params.supplierInvoiceId, (supplierInvoice as any).state)));
});

p2pRouter.post("/supplier-invoices/:supplierInvoiceId/cancel", (req, res) => {
  const supplierInvoice = cancelInvoice(req.params.supplierInvoiceId, req.actor);
  res.json(entityWithLinks(supplierInvoice as any, supplierInvoiceLinks(req.params.supplierInvoiceId, (supplierInvoice as any).state)));
});

// ── AP Payment routes ────────────────────────────────────────────────────────

p2pRouter.get("/ap-payments", (_req, res) => {
  const rows = listApPayments().map((row: any) => entityWithLinks(row, apPaymentLinks(row.ap_payment_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/ap-payments/:apPaymentId", (req, res) => {
  const apPayment = getApPaymentById(req.params.apPaymentId);
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments", validateBody(createApPaymentSchema), (req, res) => {
  const apPayment = createApPayment(req.body, req.actor);
  res.status(201).json(entityWithLinks(apPayment as any, apPaymentLinks((apPayment as any).ap_payment_id, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments/:apPaymentId/receive", (req, res) => {
  const apPayment = receiveApPayment(req.params.apPaymentId, req.actor);
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments/:apPaymentId/apply", (req, res) => {
  const apPayment = applyApPayment(req.params.apPaymentId, req.actor);
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments/:apPaymentId/reconcile", (req, res) => {
  const apPayment = reconcileApPayment(req.params.apPaymentId, req.actor);
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments/:apPaymentId/cancel", (req, res) => {
  const apPayment = cancelApPayment(req.params.apPaymentId, req.actor);
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});
