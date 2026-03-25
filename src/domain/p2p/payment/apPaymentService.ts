import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type ApPaymentState = "Initiated" | "Executed" | "Reconciled";

const transitions: Record<ApPaymentState, ApPaymentState[]> = {
  Initiated: ["Executed"],
  Executed: ["Reconciled"],
  Reconciled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getApPaymentById(apPaymentId: string) {
  const row = db.prepare("SELECT * FROM p2p_ap_payment WHERE ap_payment_id = ?").get(apPaymentId) as
    | {
        ap_payment_id: string;
        supplier_invoice_id: string;
        state: ApPaymentState;
        amount: number;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "AP payment not found");
  }

  return row;
}

export function listApPayments() {
  return db.prepare("SELECT * FROM p2p_ap_payment ORDER BY created_at DESC LIMIT 100").all();
}

function assertTransition(fromState: ApPaymentState, toState: ApPaymentState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition AP payment from ${fromState} to ${toState}`);
  }
}

export function createApPayment(input: { supplierInvoiceId: string; amount: number }) {
  const apPaymentId = newId("APPAY-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_ap_payment(ap_payment_id, supplier_invoice_id, state, amount, executed_at, version, created_at, updated_at)
       VALUES (?, ?, 'Initiated', ?, NULL, 1, ?, ?)`
    ).run(apPaymentId, input.supplierInvoiceId, input.amount, timestamp, timestamp);

    appendEvent({
      entityId: apPaymentId,
      entityType: "ApPayment",
      eventType: "ApPaymentInitiated",
      version: 1,
      payload: { supplierInvoiceId: input.supplierInvoiceId, amount: input.amount }
    });
  });

  return getApPaymentById(apPaymentId);
}

export function updateApPaymentState(apPaymentId: string, toState: ApPaymentState) {
  const apPayment = getApPaymentById(apPaymentId);
  assertTransition(apPayment.state, toState);

  const nextVersion = apPayment.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE p2p_ap_payment SET state = ?, version = ?, executed_at = ?, updated_at = ? WHERE ap_payment_id = ?")
      .run(toState, nextVersion, toState === "Executed" ? timestamp : null, timestamp, apPaymentId);

    if (toState === "Executed") {
      const supplierInvoice = db
        .prepare("SELECT amount_due, amount_paid, version FROM p2p_supplier_invoice WHERE supplier_invoice_id = ?")
        .get(apPayment.supplier_invoice_id) as
        | { amount_due: number; amount_paid: number; version: number }
        | undefined;

      if (!supplierInvoice) {
        throw new HttpError(404, "not_found", "Supplier invoice not found");
      }

      const nextAmountPaid = supplierInvoice.amount_paid + apPayment.amount;
      const supplierInvoiceState = nextAmountPaid >= supplierInvoice.amount_due ? "Paid" : "Posted";

      db.prepare(
        "UPDATE p2p_supplier_invoice SET amount_paid = ?, state = ?, version = version + 1, updated_at = ? WHERE supplier_invoice_id = ?"
      ).run(nextAmountPaid, supplierInvoiceState, timestamp, apPayment.supplier_invoice_id);

      appendEvent({
        entityId: apPayment.supplier_invoice_id,
        entityType: "SupplierInvoice",
        eventType: "SupplierInvoicePaymentApplied",
        version: supplierInvoice.version + 1,
        payload: {
          amount: apPayment.amount,
          amountPaid: nextAmountPaid,
          amountDue: supplierInvoice.amount_due
        }
      });
    }

    appendEvent({
      entityId: apPaymentId,
      entityType: "ApPayment",
      eventType: `ApPayment${toState}`,
      version: nextVersion,
      payload: { from: apPayment.state, to: toState }
    });
  });

  return getApPaymentById(apPaymentId);
}
