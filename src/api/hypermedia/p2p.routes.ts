import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import {
  createRequisition,
  getRequisitionById,
  listRequisitions,
  updateRequisitionState
} from "../../domain/p2p/requisition/requisitionService";
import { createSupplier, getSupplierById, listSuppliers } from "../../domain/p2p/supplier/supplierService";
import {
  createPurchaseOrder,
  createPurchaseOrderFromRequisition,
  getPurchaseOrderById,
  listPurchaseOrders,
  updatePurchaseOrderState
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
  updateSupplierInvoiceState
} from "../../domain/p2p/invoice/supplierInvoiceService";
import { createApPayment, getApPaymentById, listApPayments, updateApPaymentState } from "../../domain/p2p/payment/apPaymentService";

const createRequisitionSchema = z.object({
  requester: z.string().min(1)
});

const createSupplierSchema = z.object({
  supplierName: z.string().min(1),
  email: z.string().email().optional()
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  requisitionId: z.string().min(1).optional(),
  totalAmount: z.number().nonnegative().optional()
});

const createReceiptSchema = z.object({
  poId: z.string().min(1)
});

const createSupplierInvoiceSchema = z.object({
  receiptId: z.string().min(1)
});

const createApPaymentSchema = z.object({
  supplierInvoiceId: z.string().min(1),
  amount: z.number().positive()
});

const convertRequisitionSchema = z.object({
  supplierId: z.string().min(1)
});

function requisitionLinks(requisitionId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/requisitions/${requisitionId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["submit"] = {
      href: `/api/v1/p2p/requisitions/${requisitionId}/submit`,
      method: "POST",
      mcpFunction: "p2p_submit_requisition"
    };
  }

  if (state === "Submitted") {
    links["approve"] = {
      href: `/api/v1/p2p/requisitions/${requisitionId}/approve`,
      method: "POST",
      mcpFunction: "p2p_approve_requisition"
    };
  }

  if (state === "Approved") {
    links["convert-to-po"] = {
      href: `/api/v1/p2p/requisitions/${requisitionId}/convert`,
      method: "POST",
      mcpFunction: "p2p_convert_requisition_to_po"
    };
  }

  return links;
}

function purchaseOrderLinks(poId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/purchase-orders/${poId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["issue"] = { href: `/api/v1/p2p/purchase-orders/${poId}/issue`, method: "POST", mcpFunction: "p2p_issue_po" };
  }

  if (state === "Issued") {
    links["acknowledge"] = {
      href: `/api/v1/p2p/purchase-orders/${poId}/acknowledge`,
      method: "POST",
      mcpFunction: "p2p_acknowledge_po"
    };
  }

  if (state === "Acknowledged") {
    links["create-receipt"] = {
      href: "/api/v1/p2p/goods-receipts",
      method: "POST",
      mcpFunction: "p2p_create_goods_receipt"
    };
  }

  return links;
}

function goodsReceiptLinks(receiptId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/goods-receipts/${receiptId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["receive"] = {
      href: `/api/v1/p2p/goods-receipts/${receiptId}/receive`,
      method: "POST",
      mcpFunction: "p2p_receive_goods"
    };
  }

  if (state === "Received") {
    links["accept"] = {
      href: `/api/v1/p2p/goods-receipts/${receiptId}/accept`,
      method: "POST",
      mcpFunction: "p2p_accept_goods"
    };
  }

  if (state === "Accepted") {
    links["create-supplier-invoice"] = {
      href: "/api/v1/p2p/supplier-invoices",
      method: "POST",
      mcpFunction: "p2p_create_supplier_invoice"
    };
  }

  return links;
}

function supplierInvoiceLinks(supplierInvoiceId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["post"] = {
      href: `/api/v1/p2p/supplier-invoices/${supplierInvoiceId}/post`,
      method: "POST",
      mcpFunction: "p2p_post_supplier_invoice"
    };
  }

  return links;
}

function apPaymentLinks(apPaymentId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/p2p/ap-payments/${apPaymentId}`, method: "GET" }
  };

  if (state === "Initiated") {
    links["execute"] = {
      href: `/api/v1/p2p/ap-payments/${apPaymentId}/execute`,
      method: "POST",
      mcpFunction: "p2p_execute_ap_payment"
    };
  }

  if (state === "Executed") {
    links["reconcile"] = {
      href: `/api/v1/p2p/ap-payments/${apPaymentId}/reconcile`,
      method: "POST",
      mcpFunction: "p2p_reconcile_ap_payment"
    };
  }

  return links;
}

export const p2pRouter = Router();

p2pRouter.get("/suppliers", (_req, res) => {
  const suppliers = listSuppliers().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/p2p/suppliers/${row.supplier_id}`, method: "GET" } })
  );
  res.json({ data: suppliers });
});

p2pRouter.get("/suppliers/:supplierId", (req, res) => {
  const supplier = getSupplierById(req.params.supplierId);
  res.json(entityWithLinks(supplier as any, { self: { href: `/api/v1/p2p/suppliers/${req.params.supplierId}`, method: "GET" } }));
});

p2pRouter.post("/suppliers", validateBody(createSupplierSchema), (req, res) => {
  const supplier = createSupplier(req.body);
  res.status(201).json(entityWithLinks(supplier as any, { self: { href: `/api/v1/p2p/suppliers/${(supplier as any).supplier_id}`, method: "GET" } }));
});

p2pRouter.get("/requisitions", (_req, res) => {
  const requisitions = listRequisitions().map((row: any) =>
    entityWithLinks(row, requisitionLinks(row.requisition_id, row.state))
  );
  res.json({ data: requisitions });
});

p2pRouter.get("/requisitions/:requisitionId", (req, res) => {
  const requisition = getRequisitionById(req.params.requisitionId);
  res.json(
    entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state))
  );
});

p2pRouter.post("/requisitions", validateBody(createRequisitionSchema), (req, res) => {
  const requisition = createRequisition(req.body.requester);
  res
    .status(201)
    .json(entityWithLinks(requisition as any, requisitionLinks((requisition as any).requisition_id, (requisition as any).state)));
});

p2pRouter.post("/requisitions/:requisitionId/submit", (req, res) => {
  const requisition = updateRequisitionState(req.params.requisitionId, "Submitted");
  res.json(
    entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state))
  );
});

p2pRouter.post("/requisitions/:requisitionId/approve", (req, res) => {
  const requisition = updateRequisitionState(req.params.requisitionId, "Approved");
  res.json(
    entityWithLinks(requisition as any, requisitionLinks(req.params.requisitionId, (requisition as any).state))
  );
});

p2pRouter.post("/requisitions/:requisitionId/convert", validateBody(convertRequisitionSchema), (req, res) => {
  const po = createPurchaseOrderFromRequisition({
    requisitionId: req.params.requisitionId,
    supplierId: req.body.supplierId
  });
  res.status(201).json(entityWithLinks(po as any, purchaseOrderLinks((po as any).po_id, (po as any).state)));
});

p2pRouter.get("/purchase-orders", (_req, res) => {
  const rows = listPurchaseOrders().map((row: any) => entityWithLinks(row, purchaseOrderLinks(row.po_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/purchase-orders/:poId", (req, res) => {
  const po = getPurchaseOrderById(req.params.poId);
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders", validateBody(createPurchaseOrderSchema), (req, res) => {
  const po = createPurchaseOrder(req.body);
  res.status(201).json(entityWithLinks(po as any, purchaseOrderLinks((po as any).po_id, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/issue", (req, res) => {
  const po = updatePurchaseOrderState(req.params.poId, "Issued");
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.post("/purchase-orders/:poId/acknowledge", (req, res) => {
  const po = updatePurchaseOrderState(req.params.poId, "Acknowledged");
  res.json(entityWithLinks(po as any, purchaseOrderLinks(req.params.poId, (po as any).state)));
});

p2pRouter.get("/goods-receipts", (_req, res) => {
  const rows = listGoodsReceipts().map((row: any) => entityWithLinks(row, goodsReceiptLinks(row.receipt_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/goods-receipts/:receiptId", (req, res) => {
  const receipt = getGoodsReceiptById(req.params.receiptId);
  res.json(entityWithLinks(receipt as any, goodsReceiptLinks(req.params.receiptId, (receipt as any).state)));
});

p2pRouter.post("/goods-receipts", validateBody(createReceiptSchema), (req, res) => {
  const receipt = createGoodsReceipt(req.body.poId);
  res.status(201).json(entityWithLinks(receipt as any, goodsReceiptLinks((receipt as any).receipt_id, (receipt as any).state)));
});

p2pRouter.post("/goods-receipts/:receiptId/receive", (req, res) => {
  const receipt = updateGoodsReceiptState(req.params.receiptId, "Received");
  res.json(entityWithLinks(receipt as any, goodsReceiptLinks(req.params.receiptId, (receipt as any).state)));
});

p2pRouter.post("/goods-receipts/:receiptId/accept", (req, res) => {
  const receipt = updateGoodsReceiptState(req.params.receiptId, "Accepted");
  res.json(entityWithLinks(receipt as any, goodsReceiptLinks(req.params.receiptId, (receipt as any).state)));
});

p2pRouter.get("/supplier-invoices", (_req, res) => {
  const rows = listSupplierInvoices().map((row: any) =>
    entityWithLinks(row, supplierInvoiceLinks(row.supplier_invoice_id, row.state))
  );
  res.json({ data: rows });
});

p2pRouter.get("/supplier-invoices/:supplierInvoiceId", (req, res) => {
  const supplierInvoice = getSupplierInvoiceById(req.params.supplierInvoiceId);
  res.json(
    entityWithLinks(
      supplierInvoice as any,
      supplierInvoiceLinks(req.params.supplierInvoiceId, (supplierInvoice as any).state)
    )
  );
});

p2pRouter.post("/supplier-invoices", validateBody(createSupplierInvoiceSchema), (req, res) => {
  const supplierInvoice = createSupplierInvoiceFromReceipt(req.body.receiptId);
  res
    .status(201)
    .json(entityWithLinks(supplierInvoice as any, supplierInvoiceLinks((supplierInvoice as any).supplier_invoice_id, (supplierInvoice as any).state)));
});

p2pRouter.post("/supplier-invoices/:supplierInvoiceId/post", (req, res) => {
  const supplierInvoice = updateSupplierInvoiceState(req.params.supplierInvoiceId, "Posted");
  res.json(
    entityWithLinks(
      supplierInvoice as any,
      supplierInvoiceLinks(req.params.supplierInvoiceId, (supplierInvoice as any).state)
    )
  );
});

p2pRouter.get("/ap-payments", (_req, res) => {
  const rows = listApPayments().map((row: any) => entityWithLinks(row, apPaymentLinks(row.ap_payment_id, row.state)));
  res.json({ data: rows });
});

p2pRouter.get("/ap-payments/:apPaymentId", (req, res) => {
  const apPayment = getApPaymentById(req.params.apPaymentId);
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments", validateBody(createApPaymentSchema), (req, res) => {
  const apPayment = createApPayment(req.body);
  res.status(201).json(entityWithLinks(apPayment as any, apPaymentLinks((apPayment as any).ap_payment_id, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments/:apPaymentId/execute", (req, res) => {
  const apPayment = updateApPaymentState(req.params.apPaymentId, "Executed");
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});

p2pRouter.post("/ap-payments/:apPaymentId/reconcile", (req, res) => {
  const apPayment = updateApPaymentState(req.params.apPaymentId, "Reconciled");
  res.json(entityWithLinks(apPayment as any, apPaymentLinks(req.params.apPaymentId, (apPayment as any).state)));
});
