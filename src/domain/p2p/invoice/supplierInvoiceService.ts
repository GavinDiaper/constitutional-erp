import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type SupplierInvoiceState = "Draft" | "Validated" | "Posted" | "Paid" | "Cancelled";

const transitions: Record<SupplierInvoiceState, SupplierInvoiceState[]> = {
  Draft: ["Validated", "Cancelled"],
  Validated: ["Posted", "Cancelled"],
  Posted: ["Paid"],
  Paid: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getSupplierInvoiceById(supplierInvoiceId: string) {
  const row = db.prepare("SELECT * FROM p2p_supplier_invoice WHERE supplier_invoice_id = ?").get(supplierInvoiceId) as
    | {
        supplier_invoice_id: string;
        po_id: string;
        supplier_id: string | null;
        state: SupplierInvoiceState;
        amount_due: number;
        amount_paid: number;
        invoice_date: string | null;
        due_date: string | null;
        currency_code: string | null;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Supplier invoice not found");
  }

  return row;
}

export function listSupplierInvoices() {
  return db.prepare("SELECT * FROM p2p_supplier_invoice ORDER BY created_at DESC LIMIT 100").all();
}

function assertTransition(fromState: SupplierInvoiceState, toState: SupplierInvoiceState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition supplier invoice from ${fromState} to ${toState}`);
  }
}

export function createSupplierInvoiceFromReceipt(
  receiptId: string,
  options: { invoiceDate?: string; dueDate?: string; currencyCode?: string } = {},
  actor?: EventActor
) {
  const receipt = db.prepare("SELECT * FROM p2p_goods_receipt WHERE receipt_id = ?").get(receiptId) as
    | { receipt_id: string; po_id: string; state: string; version: number }
    | undefined;

  if (!receipt) {
    throw new HttpError(404, "not_found", "Goods receipt not found");
  }

  if (receipt.state !== "Accepted") {
    throw new HttpError(409, "invalid_transition", "Goods receipt must be Accepted before invoicing");
  }

  const po = db.prepare("SELECT * FROM p2p_purchase_order WHERE po_id = ?").get(receipt.po_id) as
    | { po_id: string; supplier_id: string; total_amount: number; currency_code: string | null; version: number }
    | undefined;

  if (!po) {
    throw new HttpError(404, "not_found", "Purchase order not found");
  }

  const supplierInvoiceId = newId("APINV-");
  const timestamp = now();
  const invoiceDate = options.invoiceDate ?? timestamp;

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_supplier_invoice(supplier_invoice_id, po_id, supplier_id, state, amount_due, amount_paid, invoice_date, due_date, currency_code, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, 0, ?, ?, ?, 1, ?, ?)`
    ).run(
      supplierInvoiceId,
      receipt.po_id,
      po.supplier_id,
      po.total_amount,
      invoiceDate,
      options.dueDate ?? null,
      options.currencyCode ?? po.currency_code ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: supplierInvoiceId,
      entityType: "SupplierInvoice",
      eventType: "invoice.created",
      version: 1,
      payload: { receiptId, poId: receipt.po_id, supplierId: po.supplier_id, amountDue: po.total_amount },
      actor
    });
  });

  return getSupplierInvoiceById(supplierInvoiceId);
}

function updateInvoiceState(supplierInvoiceId: string, toState: SupplierInvoiceState, eventType: string, actor?: EventActor) {
  const supplierInvoice = getSupplierInvoiceById(supplierInvoiceId);
  assertTransition(supplierInvoice.state, toState);

  const nextVersion = supplierInvoice.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE p2p_supplier_invoice SET state = ?, version = ?, updated_at = ? WHERE supplier_invoice_id = ?")
      .run(toState, nextVersion, timestamp, supplierInvoiceId);

    appendEvent({
      entityId: supplierInvoiceId,
      entityType: "SupplierInvoice",
      eventType,
      version: nextVersion,
      payload: { from: supplierInvoice.state, to: toState },
      actor
    });
  });

  return getSupplierInvoiceById(supplierInvoiceId);
}

export function validateInvoice(supplierInvoiceId: string, actor?: EventActor) {
  return updateInvoiceState(supplierInvoiceId, "Validated", "invoice.validated", actor);
}

export function postInvoice(supplierInvoiceId: string, actor?: EventActor) {
  return updateInvoiceState(supplierInvoiceId, "Posted", "invoice.posted", actor);
}

export function cancelInvoice(supplierInvoiceId: string, actor?: EventActor) {
  return updateInvoiceState(supplierInvoiceId, "Cancelled", "invoice.cancelled", actor);
}

/** @deprecated use postInvoice */
export function updateSupplierInvoiceState(supplierInvoiceId: string, toState: SupplierInvoiceState, actor?: EventActor) {
  const eventTypeMap: Partial<Record<SupplierInvoiceState, string>> = {
    Validated: "invoice.validated",
    Posted: "invoice.posted",
    Cancelled: "invoice.cancelled"
  };
  return updateInvoiceState(supplierInvoiceId, toState, eventTypeMap[toState] ?? `invoice.${toState.toLowerCase()}`, actor);
}
