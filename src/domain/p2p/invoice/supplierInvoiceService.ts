import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type SupplierInvoiceState = "Draft" | "Posted" | "Paid" | "Reconciled";

const transitions: Record<SupplierInvoiceState, SupplierInvoiceState[]> = {
  Draft: ["Posted"],
  Posted: ["Paid"],
  Paid: ["Reconciled"],
  Reconciled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getSupplierInvoiceById(supplierInvoiceId: string) {
  const row = db.prepare("SELECT * FROM p2p_supplier_invoice WHERE supplier_invoice_id = ?").get(supplierInvoiceId) as
    | {
        supplier_invoice_id: string;
        po_id: string;
        state: SupplierInvoiceState;
        amount_due: number;
        amount_paid: number;
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

export function createSupplierInvoiceFromReceipt(receiptId: string) {
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
    | { po_id: string; total_amount: number; version: number }
    | undefined;

  if (!po) {
    throw new HttpError(404, "not_found", "Purchase order not found");
  }

  const supplierInvoiceId = newId("APINV-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_supplier_invoice(supplier_invoice_id, po_id, state, amount_due, amount_paid, version, created_at, updated_at)
       VALUES (?, ?, 'Draft', ?, 0, 1, ?, ?)`
    ).run(supplierInvoiceId, receipt.po_id, po.total_amount, timestamp, timestamp);

    db.prepare("UPDATE p2p_purchase_order SET state = 'Invoiced', version = version + 1, updated_at = ? WHERE po_id = ?")
      .run(timestamp, receipt.po_id);

    appendEvent({
      entityId: supplierInvoiceId,
      entityType: "SupplierInvoice",
      eventType: "SupplierInvoiceCreated",
      version: 1,
      payload: { receiptId, poId: receipt.po_id, amountDue: po.total_amount }
    });
  });

  return getSupplierInvoiceById(supplierInvoiceId);
}

export function updateSupplierInvoiceState(supplierInvoiceId: string, toState: SupplierInvoiceState) {
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
      eventType: `SupplierInvoice${toState}`,
      version: nextVersion,
      payload: { from: supplierInvoice.state, to: toState }
    });
  });

  return getSupplierInvoiceById(supplierInvoiceId);
}
