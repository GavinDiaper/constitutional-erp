import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { createAndPostP2PJournal, reversePostedJournal } from "../accounting/p2pPostingService";
import { calculateTax, determineTaxByCode, getTaxLinesForEntity, persistTaxLine } from "../../tax/taxService";
import { createAndPostTaxAwareJournal } from "../../tax/taxPostingService";


type SupplierInvoiceState = "Draft" | "Validated" | "Posted" | "Paid" | "Cancelled";

const transitions: Record<SupplierInvoiceState, SupplierInvoiceState[]> = {
  Draft: ["Validated", "Cancelled"],
  Validated: ["Posted", "Cancelled"],
  Posted: ["Paid", "Cancelled"],
  Paid: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

function refreshContractorAccrualStatus(accrualId: string, timestamp: string) {
  const allocation = db.prepare(
    `SELECT a.amount, COALESCE(SUM(m.matched_amount), 0) AS matched_amount,
            MIN(CASE WHEN si.state IN ('Posted', 'Paid') THEN 1 ELSE 0 END) AS all_posted,
            MIN(CASE WHEN si.state = 'Paid' THEN 1 ELSE 0 END) AS all_paid,
            MIN(si.supplier_invoice_id) AS any_invoice_id
     FROM h2r_contractor_accrual a
     LEFT JOIN p2p_supplier_invoice_timesheet_accrual m ON m.accrual_id = a.accrual_id
     LEFT JOIN p2p_supplier_invoice si ON si.supplier_invoice_id = m.supplier_invoice_id
     WHERE a.accrual_id = ?
     GROUP BY a.accrual_id`
  ).get(accrualId) as {
    amount: number;
    matched_amount: number;
    all_posted: number | null;
    all_paid: number | null;
    any_invoice_id: string | null;
  } | undefined;
  if (!allocation) return;

  const fullyAllocated = allocation.matched_amount >= allocation.amount - 0.005;
  const fullyPosted = fullyAllocated && allocation.all_posted === 1;
  const fullyPaid = fullyPosted && allocation.all_paid === 1;
  db.prepare(
    `UPDATE h2r_contractor_accrual SET status = ?, supplier_invoice_id = ?, updated_at = ?
     WHERE accrual_id = ? AND status <> 'Paid'`
  ).run(
    fullyPaid ? "Paid" : fullyPosted ? "Invoiced" : "Accrued",
    fullyPosted ? allocation.any_invoice_id : null,
    timestamp,
    accrualId
  );
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
  requestedAllocations: Array<string | { accrualId: string; amount: number }>,
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
  const allocations = requestedAllocations.map((allocation) => typeof allocation === "string"
    ? { accrualId: allocation.trim(), requestedAmount: null as number | null }
    : { accrualId: allocation.accrualId.trim(), requestedAmount: Number(allocation.amount) });
  const uniqueIds = [...new Set(allocations.map(({ accrualId }) => accrualId).filter(Boolean))];
  if (uniqueIds.length === 0 || uniqueIds.length !== allocations.length) {
    throw new HttpError(400, "invalid_request", "Provide one or more unique contractor accrual allocations");
  }
  const accrualRows = uniqueIds.map((accrualId) => db.prepare(
    "SELECT * FROM h2r_contractor_accrual WHERE accrual_id = ?"
  ).get(accrualId) as {
    accrual_id: string;
    supplier_id: string | null;
    currency: string;
    amount: number;
    status: string;
  } | undefined);
  if (accrualRows.some((row) => !row)) throw new HttpError(404, "not_found", "One or more contractor accruals were not found");
  const accruals = accrualRows as NonNullable<(typeof accrualRows)[number]>[];
  if (accruals.some((row) => !["Accrued", "Invoiced"].includes(row.status))) {
    throw new HttpError(409, "accrual_not_available", "All matched contractor accruals must be accrued and not previously invoiced");
  }
  if (accruals.some((row) => row.supplier_id !== invoice.supplier_id)) {
    throw new HttpError(409, "supplier_mismatch", "Supplier invoice supplier does not match all selected contractor accruals");
  }
  if (invoice.currency_code && accruals.some((row) => row.currency !== invoice.currency_code)) {
    throw new HttpError(409, "currency_mismatch", "Supplier invoice currency does not match contractor accrual currency");
  }

  const resolvedAllocations = allocations.map(({ accrualId, requestedAmount }) => {
    const accrual = accruals.find((row) => row.accrual_id === accrualId)!;
    const alreadyAllocated = db.prepare(
      `SELECT COALESCE(SUM(m.matched_amount), 0) AS amount
       FROM p2p_supplier_invoice_timesheet_accrual m
       JOIN p2p_supplier_invoice si ON si.supplier_invoice_id = m.supplier_invoice_id
       WHERE m.accrual_id = ? AND si.state <> 'Cancelled' AND m.supplier_invoice_id <> ?`
    ).get(accrualId, supplierInvoiceId) as { amount: number };
    const availableAmount = Math.round((Number(accrual.amount) - Number(alreadyAllocated.amount)) * 100) / 100;
    const amount = requestedAmount ?? availableAmount;
    if (!Number.isFinite(amount) || amount <= 0 || amount > availableAmount + 0.005) {
      throw new HttpError(409, "accrual_amount_unavailable", `Requested amount for accrual ${accrualId} exceeds its available balance ${availableAmount.toFixed(2)}`);
    }
    return { accrualId, amount: Math.round(amount * 100) / 100 };
  });
  const accrualAmount = Math.round(resolvedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0) * 100) / 100;
  const existingMatches = db.prepare(
    `SELECT accrual_id, matched_amount FROM p2p_supplier_invoice_timesheet_accrual
     WHERE supplier_invoice_id = ? ORDER BY accrual_id`
  ).all(supplierInvoiceId) as Array<{ accrual_id: string; matched_amount: number }>;
  if (existingMatches.length > 0) {
    const sameAllocations = existingMatches.length === resolvedAllocations.length && resolvedAllocations.every((allocation) =>
      existingMatches.some((existing) => existing.accrual_id === allocation.accrualId && Math.abs(existing.matched_amount - allocation.amount) < 0.005)
    );
    if (sameAllocations) return getSupplierInvoiceById(supplierInvoiceId);
    throw new HttpError(409, "invoice_already_matched", "Supplier invoice already has different contractor accrual allocations");
  }
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
    for (const allocation of resolvedAllocations) {
      insert.run(supplierInvoiceId, allocation.accrualId, allocation.amount, timestamp);
    }
    appendEvent({
      entityId: supplierInvoiceId,
      entityType: "SupplierInvoice",
      eventType: "invoice.timesheet_accruals_matched",
      version: invoice.version,
      actor,
      payload: { allocations: resolvedAllocations, matchedAmount: accrualAmount }
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
  if (toState === "Cancelled" && supplierInvoice.amount_paid > 0) {
    throw new HttpError(409, "invoice_has_payments", "A supplier invoice with applied payments cannot be cancelled");
  }

  const nextVersion = supplierInvoice.version + 1;
  const timestamp = now();

  transaction(() => {
    let accountingJournalId: string | null = null;
    let reversalJournalId: string | null = null;
    let affectedAccruals: Array<{ accrual_id: string }> = [];

    if (toState === "Cancelled" && supplierInvoice.accounting_journal_id) {
      reversalJournalId = reversePostedJournal(
        supplierInvoice.accounting_journal_id,
        `Reversal of AP invoice ${supplierInvoiceId}`,
        actor
      ).journalId;
    }

    if (toState === "Posted") {
      affectedAccruals = db.prepare(
        "SELECT accrual_id FROM p2p_supplier_invoice_timesheet_accrual WHERE supplier_invoice_id = ?"
      ).all(supplierInvoiceId) as Array<{ accrual_id: string }>;
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
    }

    db.prepare("UPDATE p2p_supplier_invoice SET state = ?, accounting_journal_id = COALESCE(?, accounting_journal_id), reversal_journal_id = COALESCE(?, reversal_journal_id), version = ?, updated_at = ? WHERE supplier_invoice_id = ?")
      .run(toState, accountingJournalId, reversalJournalId, nextVersion, timestamp, supplierInvoiceId);

    if (toState === "Cancelled") {
      affectedAccruals = db.prepare(
        "SELECT accrual_id FROM p2p_supplier_invoice_timesheet_accrual WHERE supplier_invoice_id = ?"
      ).all(supplierInvoiceId) as Array<{ accrual_id: string }>;
      db.prepare("DELETE FROM p2p_supplier_invoice_timesheet_accrual WHERE supplier_invoice_id = ?")
        .run(supplierInvoiceId);
      for (const { accrual_id: accrualId } of affectedAccruals) {
        refreshContractorAccrualStatus(accrualId, timestamp);
      }
    }

    if (toState === "Posted") {
      for (const { accrual_id: accrualId } of affectedAccruals) {
        refreshContractorAccrualStatus(accrualId, timestamp);
      }
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
        reversalJournalId,
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
