import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { createAndPostP2PJournal } from "../accounting/p2pPostingService";

type ApPaymentState = "Draft" | "Received" | "Applied" | "Reconciled" | "Cancelled";

const transitions: Record<ApPaymentState, ApPaymentState[]> = {
  Draft: ["Received", "Cancelled"],
  Received: ["Applied", "Cancelled"],
  Applied: ["Reconciled"],
  Reconciled: [],
  Cancelled: []
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
        currency_code: string | null;
        payment_date: string | null;
        method: string | null;
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

export function createApPayment(
  input: { supplierInvoiceId: string; amount: number; currencyCode?: string; method?: string },
  actor?: EventActor
) {
  const apPaymentId = newId("APPAY-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_ap_payment(ap_payment_id, supplier_invoice_id, state, amount, currency_code, method, executed_at, version, created_at, updated_at)
       VALUES (?, ?, 'Draft', ?, ?, ?, NULL, 1, ?, ?)`
    ).run(
      apPaymentId,
      input.supplierInvoiceId,
      input.amount,
      input.currencyCode ?? null,
      input.method ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: apPaymentId,
      entityType: "ApPayment",
      eventType: "payment.registered",
      version: 1,
      payload: {
        supplierInvoiceId: input.supplierInvoiceId,
        amount: input.amount,
        currencyCode: input.currencyCode ?? null,
        method: input.method ?? null
      },
      actor
    });
  });

  return getApPaymentById(apPaymentId);
}

function updateApState(apPaymentId: string, toState: ApPaymentState, eventType: string, actor?: EventActor) {
  const apPayment = getApPaymentById(apPaymentId);
  assertTransition(apPayment.state, toState);

  const nextVersion = apPayment.version + 1;
  const timestamp = now();

  transaction(() => {
    let accountingJournalId: string | null = null;

    db.prepare("UPDATE p2p_ap_payment SET state = ?, version = ?, payment_date = ?, updated_at = ? WHERE ap_payment_id = ?")
      .run(toState, nextVersion, toState === "Applied" ? timestamp : null, timestamp, apPaymentId);

    if (toState === "Applied") {
      const posting = createAndPostP2PJournal(
        {
          amount: apPayment.amount,
          debitAccountCode: "SYS-200-LIAB-AP",
          creditAccountCode: "SYS-100-ASSET-CASH",
          description: `AP settlement for payment ${apPaymentId}`,
          memo: `P2P AP settlement ${apPaymentId}`,
          referenceEntityType: "ApPayment",
          referenceEntityId: apPaymentId
        },
        actor
      );
      accountingJournalId = posting.journalId;

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
        eventType: "invoice.payment-applied",
        version: supplierInvoice.version + 1,
        payload: {
          amount: apPayment.amount,
          amountPaid: nextAmountPaid,
          amountDue: supplierInvoice.amount_due
        },
        actor
      });
    }

    appendEvent({
      entityId: apPaymentId,
      entityType: "ApPayment",
      eventType,
      version: nextVersion,
      payload: {
        from: apPayment.state,
        to: toState,
        accountingJournalId,
        amount: apPayment.amount
      },
      actor
    });
  });

  return getApPaymentById(apPaymentId);
}

export function receiveApPayment(apPaymentId: string, actor?: EventActor) {
  return updateApState(apPaymentId, "Received", "payment.received", actor);
}

export function applyApPayment(apPaymentId: string, actor?: EventActor) {
  return updateApState(apPaymentId, "Applied", "payment.applied", actor);
}

export function reconcileApPayment(apPaymentId: string, actor?: EventActor) {
  return updateApState(apPaymentId, "Reconciled", "payment.reconciled", actor);
}

export function cancelApPayment(apPaymentId: string, actor?: EventActor) {
  return updateApState(apPaymentId, "Cancelled", "payment.cancelled", actor);
}

/** @deprecated use named command functions */
export function updateApPaymentState(apPaymentId: string, toState: ApPaymentState, actor?: EventActor) {
  const eventTypeMap: Partial<Record<ApPaymentState, string>> = {
    Received: "payment.received",
    Applied: "payment.applied",
    Reconciled: "payment.reconciled",
    Cancelled: "payment.cancelled"
  };
  return updateApState(apPaymentId, toState, eventTypeMap[toState] ?? `payment.${toState.toLowerCase()}`, actor);
}
