import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { calculateTax, determineTaxByCode, persistTaxLine, getTaxLinesForEntity } from "../../tax/taxService";
import { createAndPostTaxAwareJournal } from "../../tax/taxPostingService";


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
        order_amount: number;
        tax_amount: number;
        total_payable: number;
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

export function generateInvoice(orderId: string, options?: { taxCodeId?: string; countryCode?: string }) {
  const order = db.prepare("SELECT * FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | {
        order_id: string;
        total_amount: number;
        currency_code: string;
        legal_entity_id: string | null;
        state: string;
        version: number;
      }
    | undefined;

  if (!order) {
    throw new HttpError(404, "not_found", "Sales order not found");
  }

  if (order.state !== "Shipped") {
    throw new HttpError(409, "invalid_transition", "Order must be Shipped before invoicing");
  }

  const invoiceId = newId("INV-");
  const timestamp = now();
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const lineRows = db.prepare(
    "SELECT order_line_id, line_total, tax_code_id FROM o2c_sales_order_line WHERE order_id = ? ORDER BY created_at ASC"
  ).all(orderId) as Array<{ order_line_id: string; line_total: number; tax_code_id: string | null }>;

  const computedOrderAmount = lineRows.reduce((sum, line) => sum + line.line_total, 0);
  const orderAmount = computedOrderAmount > 0 ? computedOrderAmount : order.total_amount;
  let totalTaxAmount = 0;
  const calculatedLineTaxes: Array<{
    lineTotal: number;
    taxDetermination: NonNullable<ReturnType<typeof determineTaxByCode>>;
    taxableAmount: number;
    taxAmount: number;
  }> = [];

  for (const line of lineRows) {
    if (!line.tax_code_id) {
      continue;
    }

    const taxDetermination = determineTaxByCode({
      taxCodeId: line.tax_code_id,
      countryCode: options?.countryCode ?? "AE",
      invoiceDate
    });

    if (!taxDetermination) {
      continue;
    }

    const taxCalc = calculateTax(line.line_total, taxDetermination.ratePercent, taxDetermination.inclusiveFlag);
    totalTaxAmount += taxCalc.taxAmount;
    calculatedLineTaxes.push({
      lineTotal: line.line_total,
      taxDetermination,
      taxableAmount: taxCalc.taxableAmount,
      taxAmount: taxCalc.taxAmount
    });
  }

  // Backward-compatible fallback: header-level tax code if no line-level tax codes were selected.
  let headerTaxDetermination: ReturnType<typeof determineTaxByCode> = null;
  if (calculatedLineTaxes.length === 0 && options?.taxCodeId) {
    headerTaxDetermination = determineTaxByCode({
      taxCodeId: options.taxCodeId,
      countryCode: options.countryCode ?? "AE",
      invoiceDate
    });

    if (headerTaxDetermination) {
      const taxCalc = calculateTax(order.total_amount, headerTaxDetermination.ratePercent, headerTaxDetermination.inclusiveFlag);
      totalTaxAmount = taxCalc.taxAmount;
    }
  }

  const totalPayable = orderAmount + totalTaxAmount;
  const amountDue = totalPayable;


  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_invoice(
        invoice_id,
        order_id,
        state,
        order_amount,
        tax_amount,
        total_payable,
        amount_due,
        amount_paid,
        version,
        created_at,
        updated_at
       ) VALUES (?, ?, 'Draft', ?, ?, ?, ?, 0, 1, ?, ?)`
      ).run(invoiceId, orderId, orderAmount, totalTaxAmount, totalPayable, amountDue, timestamp, timestamp);

    db.prepare("UPDATE o2c_sales_order SET state = 'Invoiced', version = version + 1, updated_at = ? WHERE order_id = ?")
      .run(timestamp, orderId);

    appendEvent({
		entityId: orderId,
		entityType: "SalesOrder",
		eventType: "order.invoiced",
		version: order.version + 1,
		payload: { invoiceId }
	});

    appendEvent({
      entityId: invoiceId,
      entityType: "Invoice",
      eventType: "ar-invoice.generated",
      version: 1,
      payload: { orderId, orderAmount, taxAmount: totalTaxAmount, totalPayable, amountDue }
    });
  });

  for (const lineTax of calculatedLineTaxes) {
    persistTaxLine({
      sourceDomain: "o2c",
      sourceEntityType: "Invoice",
      sourceEntityId: invoiceId,
      legalEntityId: order.legal_entity_id ?? undefined,
      taxRegimeId: lineTax.taxDetermination.taxRegimeId,
      taxJurisdictionId: lineTax.taxDetermination.jurisdictionId ?? undefined,
      taxCodeId: lineTax.taxDetermination.taxCodeId,
      taxRateId: lineTax.taxDetermination.taxRateId ?? undefined,
      taxRuleId: lineTax.taxDetermination.taxRuleId ?? undefined,
      transactionType: "ar-invoice",
      taxApplicability: lineTax.taxDetermination.taxApplicability,
      taxableAmount: lineTax.taxableAmount,
      taxAmount: lineTax.taxAmount,
      currencyCode: order.currency_code ?? "USD"
    });
  }

  if (calculatedLineTaxes.length === 0 && headerTaxDetermination) {
    const taxCalc = calculateTax(order.total_amount, headerTaxDetermination.ratePercent, headerTaxDetermination.inclusiveFlag);
    persistTaxLine({
      sourceDomain: "o2c",
      sourceEntityType: "Invoice",
      sourceEntityId: invoiceId,
      legalEntityId: order.legal_entity_id ?? undefined,
      taxRegimeId: headerTaxDetermination.taxRegimeId,
      taxJurisdictionId: headerTaxDetermination.jurisdictionId ?? undefined,
      taxCodeId: headerTaxDetermination.taxCodeId,
      taxRateId: headerTaxDetermination.taxRateId ?? undefined,
      taxRuleId: headerTaxDetermination.taxRuleId ?? undefined,
      transactionType: "ar-invoice",
      taxApplicability: headerTaxDetermination.taxApplicability,
      taxableAmount: taxCalc.taxableAmount,
      taxAmount: taxCalc.taxAmount,
      currencyCode: order.currency_code ?? "USD"
    });
  }


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
  const invoice = getInvoiceById(invoiceId);
  _doInvoiceTransition(invoiceId, "Posted", actor);

  const taxLines = getTaxLinesForEntity(invoiceId).filter(l => l.accounting_status === "pending");
  if (taxLines.length > 0) {
    createAndPostTaxAwareJournal({
      eventType: "ar-invoice.posted",
      baseAmount: invoice.order_amount,
      debitAccountCode: "SYS-110-ASSET-AR",
      creditAccountCode: "SYS-400-REV-SALES",
      sourceEntityId: invoiceId,
      sourceEntityType: "Invoice",
      description: `AR Invoice posted: ${invoiceId}`,
      transactionType: "ar-invoice"
    }, actor);
  }

  return getInvoiceById(invoiceId);
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
