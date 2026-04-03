import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type PaymentState = "Received" | "Applied" | "Reconciled" | "Cancelled";

const transitions: Record<PaymentState, PaymentState[]> = {
  Received: ["Applied", "Cancelled"],
  Applied: ["Reconciled", "Cancelled"],
  Reconciled: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getPaymentById(paymentId: string) {
  const row = db.prepare("SELECT * FROM o2c_payment WHERE payment_id = ?").get(paymentId) as
    | {
        payment_id: string;
        invoice_id: string;
        state: PaymentState;
        amount: number;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Payment not found");
  }

  return row;
}

export function listPayments() {
  return db.prepare("SELECT * FROM o2c_payment ORDER BY created_at DESC LIMIT 100").all();
}

export function registerPayment(input: { invoiceId: string; amount: number; currencyCode?: string; method?: string; paymentDate?: string }, actor?: EventActor) {
  const paymentId = newId("PAY-");
  const timestamp = now();
  const paymentDate = input.paymentDate ?? timestamp;

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_payment(payment_id, invoice_id, state, amount, received_at, currency_code, method, payment_date, version, created_at, updated_at)
       VALUES (?, ?, 'Received', ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(paymentId, input.invoiceId, input.amount, timestamp, input.currencyCode ?? null, input.method ?? null, paymentDate, timestamp, timestamp);

    appendEvent({
      entityId: paymentId,
      entityType: "Payment",
      eventType: "ar-payment.received",
      version: 1,
      actor,
      payload: { invoiceId: input.invoiceId, amount: input.amount }
    });
  });

  return getPaymentById(paymentId);
}

function assertTransition(fromState: PaymentState, toState: PaymentState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition payment from ${fromState} to ${toState}`);
  }
}

export function updatePaymentState(paymentId: string, toState: PaymentState, actor?: EventActor) {
  return _doPaymentTransition(paymentId, toState, actor);
}

function _doPaymentTransition(paymentId: string, toState: PaymentState, actor?: EventActor) {
  const payment = getPaymentById(paymentId);
  assertTransition(payment.state, toState);

  const nextVersion = payment.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_payment SET state = ?, version = ?, updated_at = ? WHERE payment_id = ?")
      .run(toState, nextVersion, timestamp, paymentId);

    if (toState === "Applied") {
      const invoice = db
        .prepare("SELECT order_id, amount_due, amount_paid, version FROM o2c_invoice WHERE invoice_id = ?")
        .get(payment.invoice_id) as { order_id: string; amount_due: number; amount_paid: number; version: number } | undefined;

      if (!invoice) {
        throw new HttpError(404, "not_found", "Invoice not found");
      }

      const invoiceAmountPaid = invoice.amount_paid + payment.amount;
      const invoiceState = invoiceAmountPaid >= invoice.amount_due ? "Paid" : "Posted";
      const invoiceNextVersion = invoice.version + 1;

      db.prepare("UPDATE o2c_invoice SET amount_paid = ?, state = ?, version = ?, updated_at = ? WHERE invoice_id = ?")
        .run(invoiceAmountPaid, invoiceState, invoiceNextVersion, timestamp, payment.invoice_id);

      appendEvent({
        entityId: payment.invoice_id,
        entityType: "Invoice",
        eventType: invoiceAmountPaid >= invoice.amount_due ? "ar-invoice.fullypaid" : "ar-invoice.partiallypaid",
        version: invoiceNextVersion,
        actor,
        payload: { amount: payment.amount, amountPaid: invoiceAmountPaid, amountDue: invoice.amount_due }
      });

    if (invoiceAmountPaid >= invoice.amount_due) {
    const order = db
      .prepare("SELECT version FROM o2c_sales_order WHERE order_id = ?")
      .get(invoice.order_id) as { version: number } | undefined;

    if (order) {
      db.prepare("UPDATE o2c_sales_order SET state = 'Paid', version = version + 1, updated_at = ? WHERE order_id = ?")
        .run(timestamp, invoice.order_id);

      appendEvent({
        entityId: invoice.order_id,
        entityType: "SalesOrder",
        eventType: "order.paid",
        version: order.version + 1,
        actor,
        payload: { invoiceId: payment.invoice_id, paymentId }
      });
    }
    }
    }

    appendEvent({
      entityId: paymentId,
      entityType: "Payment",
      eventType: `ar-payment.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: payment.state, to: toState }
    });
  });

  return getPaymentById(paymentId);
}

export function applyARPayment(paymentId: string, actor?: EventActor) {
  return _doPaymentTransition(paymentId, "Applied", actor);
}

export function reconcileARPayment(paymentId: string, actor?: EventActor) {
  return _doPaymentTransition(paymentId, "Reconciled", actor);
}

export function cancelARPayment(paymentId: string, actor?: EventActor) {
  return _doPaymentTransition(paymentId, "Cancelled", actor);
}
