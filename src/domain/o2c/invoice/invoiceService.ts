import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type InvoiceState = "Draft" | "Posted" | "Paid" | "Reconciled" | "Cancelled";

const transitions: Record<InvoiceState, InvoiceState[]> = {
  Draft: ["Posted", "Cancelled"],
  Posted: ["Paid", "Cancelled"],
  Paid: ["Reconciled"],
  Reconciled: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getInvoiceById(invoiceId: string) {
  const row = db.prepare("SELECT * FROM o2c_invoice WHERE invoice_id = ?").get(invoiceId) as
    | {
        invoice_id: string;
        order_id: string;
        state: InvoiceState;
        amount_due: number;
        amount_paid: number;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Invoice not found");
  }

  return row;
}

export function listInvoices() {
  return db.prepare("SELECT * FROM o2c_invoice ORDER BY created_at DESC LIMIT 100").all();
}

function assertTransition(fromState: InvoiceState, toState: InvoiceState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition invoice from ${fromState} to ${toState}`);
  }
}

export function generateInvoice(orderId: string) {
  const order = db.prepare("SELECT * FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | { order_id: string; total_amount: number; state: string; version: number }
    | undefined;

  if (!order) {
    throw new HttpError(404, "not_found", "Sales order not found");
  }

  if (order.state !== "Shipped") {
    throw new HttpError(409, "invalid_transition", "Order must be Shipped before invoicing");
  }

  const invoiceId = newId("INV-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_invoice(invoice_id, order_id, state, amount_due, amount_paid, version, created_at, updated_at)
       VALUES (?, ?, 'Draft', ?, 0, 1, ?, ?)`
    ).run(invoiceId, orderId, order.total_amount, timestamp, timestamp);

    db.prepare("UPDATE o2c_sales_order SET state = 'Invoiced', version = version + 1, updated_at = ? WHERE order_id = ?")
      .run(timestamp, orderId);

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.generated",
      version: 1,
      payload: { orderId, amountDue: order.total_amount }
    });
  });

  return getInvoiceById(invoiceId);
}

export function updateInvoiceState(invoiceId: string, toState: InvoiceState, actor?: EventActor) {
  return _doInvoiceTransition(invoiceId, toState, actor);
}

function _doInvoiceTransition(invoiceId: string, toState: InvoiceState, actor?: EventActor) {
  const invoice = getInvoiceById(invoiceId);
  assertTransition(invoice.state, toState);

  const nextVersion = invoice.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_invoice SET state = ?, version = ?, updated_at = ? WHERE invoice_id = ?")
      .run(toState, nextVersion, timestamp, invoiceId);

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: `ar-invoice.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: invoice.state, to: toState }
    });
  });

  return getInvoiceById(invoiceId);
}

export function postARInvoice(invoiceId: string, actor?: EventActor) {
  return _doInvoiceTransition(invoiceId, "Posted", actor);
}

export function cancelARInvoice(invoiceId: string, actor?: EventActor) {
  return _doInvoiceTransition(invoiceId, "Cancelled", actor);
}

export function addInvoicePayment(invoiceId: string, amount: number) {
  const invoice = getInvoiceById(invoiceId);
  const timestamp = now();

  const nextPaidAmount = invoice.amount_paid + amount;
  const nextState = nextPaidAmount >= invoice.amount_due ? "Paid" : invoice.state;
  const nextVersion = invoice.version + 1;

  transaction(() => {
    db.prepare("UPDATE o2c_invoice SET amount_paid = ?, state = ?, version = ?, updated_at = ? WHERE invoice_id = ?")
      .run(nextPaidAmount, nextState, nextVersion, timestamp, invoiceId);

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.payment_applied",
      version: nextVersion,
      payload: { amount, amountPaid: nextPaidAmount, amountDue: invoice.amount_due }
    });
  });

  return getInvoiceById(invoiceId);
}
