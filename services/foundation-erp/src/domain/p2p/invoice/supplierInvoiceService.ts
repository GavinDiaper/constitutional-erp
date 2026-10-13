import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { createAndPostP2PJournal } from "../accounting/p2pPostingService";
import { calculateTax, determineTaxByCode, getTaxLinesForEntity, persistTaxLine } from "../../tax/taxService";
import { createAndPostTaxAwareJournal } from "../../tax/taxPostingService";


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
        accounting_journal_id: string | null;
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

export function matchSupplierInvoiceToContractorAccruals(
  supplierInvoiceId: string,
  accrualIds: string[],
  actor?: EventActor
) {
  const invoice = getSupplierInvoiceById(supplierInvoiceId) as {
    supplier_invoice_id: string;
    supplier_id: string | null;
    state: SupplierInvoiceState;
    amount_due: number;
    currency_code: string | null;
    version: number;
  };
  if (!invoice.supplier_id) throw new HttpError(409, "supplier_required", "Supplier invoice must have a supplier before timesheet matching");
  if (!['Draft', 'Validated'].includes(invoice.state)) {
    throw new HttpError(409, "invalid_transition", "Only Draft or Validated supplier invoices can be matched to timesheet accruals");
  }
  const uniqueIds = [...new Set(accrualIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0 || uniqueIds.length !== accrualIds.length) {
    throw new HttpError(400, "invalid_request", "Provide one or more unique contractor accrual IDs");
  }
  const accrualRows = uniqueIds.map((accrualId) => db.prepare(
    "SELECT * FROM h2r_contractor_accrual WHERE accrual_id = ?"
  ).get(accrualId) as {
    accrual_id: string;
    supplier_id: string | null;
    currency: string;
    amount: number;
    status: string;
    supplier_invoice_id: string | null;
  } | undefined);
  if (accrualRows.some((row) => !row)) throw new HttpError(404, "not_found", "One or more contractor accruals were not found");
  const accruals = accrualRows as NonNullable<(typeof accrualRows)[number]>[];
  if (accruals.some((row) => row.status !== "Accrued" || row.supplier_invoice_id)) {
    throw new HttpError(409, "accrual_not_available", "All matched contractor accruals must be accrued and not previously invoiced");
  }
  if (accruals.some((row) => row.supplier_id !== invoice.supplier_id)) {
    throw new HttpError(409, "supplier_mismatch", "Supplier invoice supplier does not match all selected contractor accruals");
  }
  if (invoice.currency_code && accruals.some((row) => row.currency !== invoice.currency_code)) {
    throw new HttpError(409, "currency_mismatch", "Supplier invoice currency does not match contractor accrual currency");
  }

  const accrualAmount = Math.round(accruals.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100;
  const taxRows = getTaxLinesForEntity(supplierInvoiceId);
  const invoiceBaseAmount = taxRows.length > 0
    ? Math.round(taxRows.reduce((sum, row) => sum + Number(row.taxable_amount), 0) * 100) / 100
    : Math.round(Number(invoice.amount_due) * 100) / 100;
  if (accrualAmount !== invoiceBaseAmount) {
    throw new HttpError(409, "accrual_amount_mismatch", `Matched accrual total ${accrualAmount.toFixed(2)} does not equal supplier invoice base ${invoiceBaseAmount.toFixed(2)}`);
  }

  const timestamp = now();
  transaction(() => {
    const insert = db.prepare(
      `INSERT INTO p2p_supplier_invoice_timesheet_accrual(supplier_invoice_id, accrual_id, matched_amount, created_at)
       VALUES (?, ?, ?, ?)`
    );
    for (const accrual of accruals) {
      insert.run(supplierInvoiceId, accrual.accrual_id, accrual.amount, timestamp);
    }
    db.prepare(
      `UPDATE h2r_contractor_accrual SET supplier_invoice_id = ?, updated_at = ?
       WHERE accrual_id IN (${uniqueIds.map(() => '?').join(',')})`
    ).run(supplierInvoiceId, timestamp, ...uniqueIds);
    appendEvent({
      entityId: supplierInvoiceId,
      entityType: "SupplierInvoice",
      eventType: "invoice.timesheet_accruals_matched",
      version: invoice.version,
      actor,
      payload: { accrualIds: uniqueIds, matchedAmount: accrualAmount }
    });
  });
  return getSupplierInvoiceById(supplierInvoiceId);
}

function assertTransition(fromState: SupplierInvoiceState, toState: SupplierInvoiceState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition supplier invoice from ${fromState} to ${toState}`);
  }
}

export function createSupplierInvoiceFromReceipt(
  receiptId: string,
  options: { invoiceDate?: string; dueDate?: string; currencyCode?: string; taxCodeId?: string; countryCode?: string } = {},
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
  // Determine tax if explicit taxCodeId provided
  let amountDue = po.total_amount;
  let taxDetermination: ReturnType<typeof determineTaxByCode> = null;
  if (options.taxCodeId) {
    const taxDate = (options.invoiceDate ?? timestamp).slice(0, 10);
    taxDetermination = determineTaxByCode({
      taxCodeId: options.taxCodeId,
      countryCode: options.countryCode ?? "AE",
      invoiceDate: taxDate
    });
    if (taxDetermination) {
      const taxCalc = calculateTax(po.total_amount, taxDetermination.ratePercent, taxDetermination.inclusiveFlag);
      amountDue = taxCalc.grossAmount;
    }
  }


  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_supplier_invoice(supplier_invoice_id, po_id, supplier_id, state, amount_due, amount_paid, invoice_date, due_date, currency_code, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, 0, ?, ?, ?, 1, ?, ?)`
    ).run(
      supplierInvoiceId,
      receipt.po_id,
      po.supplier_id,
      amountDue,
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
      payload: { receiptId, poId: receipt.po_id, supplierId: po.supplier_id, amountDue },
      actor
    });

    if (taxDetermination) {
      const taxCalc = calculateTax(po.total_amount, taxDetermination.ratePercent, taxDetermination.inclusiveFlag);
      persistTaxLine({
        sourceDomain: "p2p",
        sourceEntityType: "SupplierInvoice",
        sourceEntityId: supplierInvoiceId,
        taxRegimeId: taxDetermination.taxRegimeId,
        taxJurisdictionId: taxDetermination.jurisdictionId ?? undefined,
        taxCodeId: taxDetermination.taxCodeId,
        taxRateId: taxDetermination.taxRateId ?? undefined,
        taxRuleId: taxDetermination.taxRuleId ?? undefined,
        transactionType: "ap-invoice",
        taxApplicability: taxDetermination.taxApplicability,
        taxableAmount: taxCalc.taxableAmount,
        taxAmount: taxCalc.taxAmount,
        currencyCode: options.currencyCode ?? po.currency_code ?? "USD"
      });
    }

  });

  return getSupplierInvoiceById(supplierInvoiceId);
}

function updateInvoiceState(supplierInvoiceId: string, toState: SupplierInvoiceState, eventType: string, actor?: EventActor) {
  const supplierInvoice = getSupplierInvoiceById(supplierInvoiceId);
  assertTransition(supplierInvoice.state, toState);

  const nextVersion = supplierInvoice.version + 1;
  const timestamp = now();

  transaction(() => {
    let accountingJournalId: string | null = null;

    if (toState === "Posted") {
      const matched = db.prepare(
        `SELECT COUNT(*) AS line_count, COALESCE(SUM(matched_amount), 0) AS amount
         FROM p2p_supplier_invoice_timesheet_accrual WHERE supplier_invoice_id = ?`
      ).get(supplierInvoiceId) as { line_count: number; amount: number };
      const posting = createAndPostTaxAwareJournal(
        {
          eventType: "ap-invoice.posted",
          baseAmount: matched.line_count > 0 ? matched.amount : supplierInvoice.amount_due,
          debitAccountCode: matched.line_count > 0 ? "SYS-205-LIAB-ACCRUED-CONTRACTOR" : "SYS-510-EXP-OPEX",
          creditAccountCode: "SYS-200-LIAB-AP",
          sourceEntityId: supplierInvoiceId,
          sourceEntityType: "SupplierInvoice",
          description: `AP accrual for supplier invoice ${supplierInvoiceId}`,
          memo: `P2P AP accrual ${supplierInvoiceId}`,
          transactionType: "ap-invoice"
        },
        actor
      );
      accountingJournalId = posting.journalId;
      if (matched.line_count > 0) {
        db.prepare(
          `UPDATE h2r_contractor_accrual SET status = 'Invoiced', updated_at = ?
           WHERE supplier_invoice_id = ? AND status = 'Accrued'`
        ).run(timestamp, supplierInvoiceId);
      }
    }

    db.prepare("UPDATE p2p_supplier_invoice SET state = ?, accounting_journal_id = COALESCE(?, accounting_journal_id), version = ?, updated_at = ? WHERE supplier_invoice_id = ?")
      .run(toState, accountingJournalId, nextVersion, timestamp, supplierInvoiceId);

    if (toState === "Cancelled") {
      db.prepare(
        `UPDATE h2r_contractor_accrual SET status = 'Accrued', supplier_invoice_id = NULL, updated_at = ?
         WHERE supplier_invoice_id = ? AND status = 'Accrued'`
      ).run(timestamp, supplierInvoiceId);
      db.prepare("DELETE FROM p2p_supplier_invoice_timesheet_accrual WHERE supplier_invoice_id = ?")
        .run(supplierInvoiceId);
    }

    appendEvent({
      entityId: supplierInvoiceId,
      entityType: "SupplierInvoice",
      eventType,
      version: nextVersion,
      payload: {
        from: supplierInvoice.state,
        to: toState,
        accountingJournalId,
        amountDue: supplierInvoice.amount_due
      },
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
