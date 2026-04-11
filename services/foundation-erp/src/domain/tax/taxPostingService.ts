import { db } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
import { resolveTaxAccount } from "./taxConfigService";
import { getTaxLinesForEntity, markTaxLinesPosted } from "./taxService";
import type { TaxApplicability, TaxTransactionType } from "./taxTypes";

function now(): string {
  return new Date().toISOString();
}

function normalizeMoney(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new HttpError(400, "invalid_amount", "Posting amount must be a non-negative number");
  }
  return Math.round(amount * 100) / 100;
}

function getAccountByCode(code: string): { accountId: string; ledgerId: string | null } {
  const row = db
    .prepare("SELECT account_id, ledger_id FROM r2r_account WHERE account_code = ?")
    .get(code) as { account_id: string; ledger_id: string | null } | undefined;
  if (!row) {
    throw new HttpError(409, "missing_account", `Required posting account '${code}' is not configured`);
  }
  return { accountId: row.account_id, ledgerId: row.ledger_id ?? null };
}

function getAccountById(accountId: string): { accountId: string; ledgerId: string | null } {
  const row = db
    .prepare("SELECT account_id, ledger_id FROM r2r_account WHERE account_id = ?")
    .get(accountId) as { account_id: string; ledger_id: string | null } | undefined;
  if (!row) {
    throw new HttpError(409, "missing_account", `Tax posting account '${accountId}' not found`);
  }
  return { accountId: row.account_id, ledgerId: row.ledger_id ?? null };
}

function getLedgerIdForLegalEntity(legalEntityId: string | null | undefined): string | null {
  if (!legalEntityId) {
    return null;
  }

  const row = db
    .prepare(
      `SELECT ledger_id
       FROM r2r_ledger
       WHERE legal_entity_id = ?
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(legalEntityId) as { ledger_id: string } | undefined;

  return row?.ledger_id ?? null;
}

function resolveSourceLedgerId(sourceEntityType: string, sourceEntityId: string): string | null {
  switch (sourceEntityType) {
    case "Invoice": {
      const row = db
        .prepare(
          `SELECT so.legal_entity_id
           FROM o2c_invoice i
           JOIN o2c_sales_order so ON so.order_id = i.order_id
           WHERE i.invoice_id = ?`
        )
        .get(sourceEntityId) as { legal_entity_id: string | null } | undefined;

      return getLedgerIdForLegalEntity(row?.legal_entity_id);
    }

    case "SupplierInvoice": {
      const row = db
        .prepare(
          `SELECT po.legal_entity_id
           FROM p2p_supplier_invoice si
           JOIN p2p_purchase_order po ON po.po_id = si.po_id
           WHERE si.supplier_invoice_id = ?`
        )
        .get(sourceEntityId) as { legal_entity_id: string | null } | undefined;

      return getLedgerIdForLegalEntity(row?.legal_entity_id);
    }

    default:
      return null;
  }
}

function findOpenFiscalPeriodId(): string | null {
  const row = db
    .prepare(
      `SELECT fiscal_period_id FROM r2r_fiscal_period WHERE state = 'Open'
       ORDER BY start_date DESC, created_at DESC LIMIT 1`
    )
    .get() as { fiscal_period_id: string } | undefined;
  return row?.fiscal_period_id ?? null;
}

function createSystemOpenFiscalPeriod(actor?: EventActor): string {
  const timestamp = now();
  const currentDate = new Date();
  const year = currentDate.getUTCFullYear();
  const fiscalYearLabel = `FY${year}`;

  const fiscalYearRow = db
    .prepare("SELECT fiscal_year_id FROM r2r_fiscal_year WHERE year_label = ? LIMIT 1")
    .get(fiscalYearLabel) as { fiscal_year_id: string } | undefined;

  const fiscalYearId = fiscalYearRow?.fiscal_year_id ?? newId("FY-");

  if (!fiscalYearRow) {
    db.prepare(
      `INSERT INTO r2r_fiscal_year(fiscal_year_id, year_label, state, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, 'Open', ?, ?, ?, ?)`
    ).run(fiscalYearId, fiscalYearLabel, `${year}-01-01T00:00:00.000Z`, `${year}-12-31T23:59:59.999Z`, timestamp, timestamp);

    appendEvent({ entityId: fiscalYearId, entityType: "FiscalYear", eventType: "fiscal-year.created", version: 1, actor, payload: { yearLabel: fiscalYearLabel } });
  }

  const periodNumber = currentDate.getUTCMonth() + 1;
  const existingPeriod = db
    .prepare("SELECT fiscal_period_id FROM r2r_fiscal_period WHERE fiscal_year_id = ? AND period_number = ? LIMIT 1")
    .get(fiscalYearId, periodNumber) as { fiscal_period_id: string } | undefined;

  const fiscalPeriodId = existingPeriod?.fiscal_period_id ?? newId("FP-");

  if (existingPeriod) {
    db.prepare("UPDATE r2r_fiscal_period SET state = 'Open', updated_at = ? WHERE fiscal_period_id = ?").run(timestamp, fiscalPeriodId);
    return fiscalPeriodId;
  }

  const periodStart = new Date(Date.UTC(year, currentDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, currentDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  db.prepare(
    `INSERT INTO r2r_fiscal_period(fiscal_period_id, fiscal_year_id, period_number, state, start_date, end_date, created_at, updated_at)
     VALUES (?, ?, ?, 'Open', ?, ?, ?, ?)`
  ).run(fiscalPeriodId, fiscalYearId, periodNumber, periodStart.toISOString(), periodEnd.toISOString(), timestamp, timestamp);

  appendEvent({ entityId: fiscalPeriodId, entityType: "FiscalPeriod", eventType: "fiscal-period.created", version: 1, actor, payload: { fiscalYearId, periodNumber } });

  return fiscalPeriodId;
}

function getOrCreateOpenFiscalPeriodId(actor?: EventActor): string {
  return findOpenFiscalPeriodId() ?? createSystemOpenFiscalPeriod(actor);
}

interface PostingLine {
  accountId: string;
  ledgerId: string | null;
  debitAmount: number;
  creditAmount: number;
  memo?: string | null;
}

function insertJournalLines(
  journalId: string,
  lines: PostingLine[],
  timestamp: string
): { journalLineIds: string[]; ledgerEntryIds: string[] } {
  const journalLineIds: string[] = [];
  const ledgerEntryIds: string[] = [];

  for (const line of lines) {
    const journalLineId = newId("JNL-L-");
    const ledgerEntryId = newId("LED-");

    db.prepare(
      `INSERT INTO r2r_journal_line(journal_line_id, journal_id, account_id, debit_amount, credit_amount, memo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(journalLineId, journalId, line.accountId, line.debitAmount, line.creditAmount, line.memo ?? null, timestamp);

    db.prepare(
      `INSERT INTO r2r_ledger_entry(ledger_entry_id, journal_id, account_id, posting_date, debit_amount, credit_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ledgerEntryId, journalId, line.accountId, timestamp, line.debitAmount, line.creditAmount, timestamp);

    journalLineIds.push(journalLineId);
    ledgerEntryIds.push(ledgerEntryId);
  }

  return { journalLineIds, ledgerEntryIds };
}

function validateBalance(lines: PostingLine[]): void {
  const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
  const diff = Math.abs(Math.round((totalDebit - totalCredit) * 100));
  if (diff > 1) {
    throw new HttpError(409, "journal_imbalanced", `Journal is not balanced (DR=${totalDebit}, CR=${totalCredit})`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface TaxAwareJournalInput {
  eventType: string;
  baseAmount: number;
  debitAccountCode: string;
  creditAccountCode: string;
  sourceEntityId: string;
  sourceEntityType: string;
  description: string;
  memo?: string;
  transactionType: TaxTransactionType;
  invoiceDate?: string;
  legalEntityId?: string;
}

export function createAndPostTaxAwareJournal(
  input: TaxAwareJournalInput,
  actor?: EventActor
): { journalId: string; ledgerEntryIds: string[] } {
  const taxLines = getTaxLinesForEntity(input.sourceEntityId).filter(
    l => l.accounting_status === "pending"
  );

  const baseDebit = getAccountByCode(input.debitAccountCode);
  const baseCredit = getAccountByCode(input.creditAccountCode);
  const baseAmount = normalizeMoney(input.baseAmount);
  const sourceLedgerId = resolveSourceLedgerId(input.sourceEntityType, input.sourceEntityId)
    ?? getLedgerIdForLegalEntity(input.legalEntityId);

  if (baseAmount === 0) {
    throw new HttpError(409, "invalid_amount", "Posting amount must be greater than zero");
  }

  if (!sourceLedgerId && (!baseDebit.ledgerId || !baseCredit.ledgerId || baseDebit.ledgerId !== baseCredit.ledgerId)) {
    throw new HttpError(409, "ledger_mismatch", "Posting accounts must belong to the same ledger");
  }

  const postingLedgerId = sourceLedgerId ?? baseDebit.ledgerId;
  if (!postingLedgerId) {
    throw new HttpError(409, "ledger_mismatch", "Posting requires a resolved ledger assignment");
  }

  // ── No tax lines → legacy 2-line fallback ────────────────────────────────
  if (taxLines.length === 0) {
    const fiscalPeriodId = getOrCreateOpenFiscalPeriodId(actor);
    const timestamp = now();
    const journalId = newId("JNL-");
    const ledgerId = postingLedgerId;

    db.prepare(
      `INSERT INTO r2r_journal(journal_id, fiscal_period_id, ledger_id, description, state, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Posted', 2, ?, ?)`
    ).run(journalId, fiscalPeriodId, ledgerId, input.description, timestamp, timestamp);

    const lines: PostingLine[] = [
      { accountId: baseDebit.accountId, ledgerId, debitAmount: baseAmount, creditAmount: 0, memo: input.memo },
      { accountId: baseCredit.accountId, ledgerId, debitAmount: 0, creditAmount: baseAmount, memo: input.memo }
    ];

    const { ledgerEntryIds } = insertJournalLines(journalId, lines, timestamp);

    appendEvent({ entityId: journalId, entityType: "Journal", eventType: "journal.created", version: 1, actor, payload: { fiscalPeriodId, ledgerId, description: input.description, sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId } });
    appendEvent({ entityId: journalId, entityType: "Journal", eventType: "journal.posted", version: 2, actor, payload: { sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId, amount: baseAmount, debitAccountId: baseDebit.accountId, creditAccountId: baseCredit.accountId, ledgerEntryIds } });

    return { journalId, ledgerEntryIds };
  }

  // ── Tax-aware multi-line journal ─────────────────────────────────────────
  const primaryLine = taxLines[0];
  const applicability = primaryLine.tax_applicability as TaxApplicability;
  const taxCodeId = primaryLine.tax_code_id;

  const totalTaxable = Math.round(taxLines.reduce((s, l) => s + l.taxable_amount, 0) * 100) / 100;
  const totalTax = Math.round(taxLines.reduce((s, l) => s + l.tax_amount, 0) * 100) / 100;
  const grossAmount = Math.round((totalTaxable + totalTax) * 100) / 100;

  const lines: PostingLine[] = [];
  const ledgerId = postingLedgerId;

  if (input.transactionType === "ap-invoice" || input.transactionType === "ap-credit-memo") {
      const asOfDate = input.invoiceDate ?? now();
    switch (applicability) {
      case "taxable":
      case "zero-rated":
      case "exempt": {
        // DR Expense (taxable), DR VAT Input (tax), CR AP (gross)
        const vatInputId = resolveTaxAccount({ taxCodeId, transactionType: input.transactionType, accountRole: "tax_recoverable", asOfDate, legalEntityId: input.legalEntityId ?? undefined });
        if (!vatInputId) throw new HttpError(409, "missing_tax_account", `No tax_recoverable account mapped for tax code '${taxCodeId}'`);
        const vatInputAcct = getAccountById(vatInputId);

        lines.push({ accountId: baseDebit.accountId, ledgerId, debitAmount: totalTaxable, creditAmount: 0, memo: input.memo });
        if (totalTax > 0) {
          lines.push({ accountId: vatInputAcct.accountId, ledgerId: vatInputAcct.ledgerId, debitAmount: totalTax, creditAmount: 0, memo: input.memo });
        }
        lines.push({ accountId: baseCredit.accountId, ledgerId, debitAmount: 0, creditAmount: grossAmount, memo: input.memo });
        break;
      }

      case "reverse-charge": {
        // DR Expense (base), CR AP (base), DR VAT Input (tax), CR VAT Output (tax)
        const vatInputId = resolveTaxAccount({ taxCodeId, transactionType: input.transactionType, accountRole: "tax_recoverable", asOfDate, legalEntityId: input.legalEntityId ?? undefined });
        const vatOutputId = resolveTaxAccount({ taxCodeId, transactionType: input.transactionType, accountRole: "tax_liability", asOfDate, legalEntityId: input.legalEntityId ?? undefined });
        if (!vatInputId) throw new HttpError(409, "missing_tax_account", `No tax_recoverable account mapped for tax code '${taxCodeId}'`);
        if (!vatOutputId) throw new HttpError(409, "missing_tax_account", `No tax_liability account mapped for tax code '${taxCodeId}'`);
        const vatInputAcct = getAccountById(vatInputId);
        const vatOutputAcct = getAccountById(vatOutputId);

        lines.push({ accountId: baseDebit.accountId, ledgerId, debitAmount: totalTaxable, creditAmount: 0, memo: input.memo });
        lines.push({ accountId: baseCredit.accountId, ledgerId, debitAmount: 0, creditAmount: totalTaxable, memo: input.memo });
        if (totalTax > 0) {
          lines.push({ accountId: vatInputAcct.accountId, ledgerId: vatInputAcct.ledgerId, debitAmount: totalTax, creditAmount: 0, memo: input.memo });
          lines.push({ accountId: vatOutputAcct.accountId, ledgerId: vatOutputAcct.ledgerId, debitAmount: 0, creditAmount: totalTax, memo: input.memo });
        }
        break;
      }

      case "withholding": {
        // DR Expense (base), CR AP (base - wht), CR WHT Payable (wht)
        const whtPayableId = resolveTaxAccount({ taxCodeId, transactionType: input.transactionType, accountRole: "withholding_payable", asOfDate, legalEntityId: input.legalEntityId ?? undefined });
        if (!whtPayableId) throw new HttpError(409, "missing_tax_account", `No withholding_payable account mapped for tax code '${taxCodeId}'`);
        const whtAcct = getAccountById(whtPayableId);
        const netAP = Math.round((totalTaxable - totalTax) * 100) / 100;

        lines.push({ accountId: baseDebit.accountId, ledgerId, debitAmount: totalTaxable, creditAmount: 0, memo: input.memo });
        lines.push({ accountId: baseCredit.accountId, ledgerId, debitAmount: 0, creditAmount: netAP, memo: input.memo });
        if (totalTax > 0) {
          lines.push({ accountId: whtAcct.accountId, ledgerId: whtAcct.ledgerId, debitAmount: 0, creditAmount: totalTax, memo: input.memo });
        }
        break;
      }

      default:
        throw new HttpError(409, "unsupported_tax_applicability", `Unsupported tax applicability '${applicability}' for AP transaction`);
    }
  } else {
    // AR transaction types
      const asOfDate = input.invoiceDate ?? now();
    switch (applicability) {
      case "taxable":
      case "zero-rated":
      case "exempt": {
        // DR AR (gross), CR Revenue (taxable), CR VAT Output (tax)
        const vatOutputId = resolveTaxAccount({ taxCodeId, transactionType: input.transactionType, accountRole: "tax_liability", asOfDate, legalEntityId: input.legalEntityId ?? undefined });
        if (!vatOutputId) throw new HttpError(409, "missing_tax_account", `No tax_liability account mapped for tax code '${taxCodeId}'`);
        const vatOutputAcct = getAccountById(vatOutputId);

        lines.push({ accountId: baseDebit.accountId, ledgerId, debitAmount: grossAmount, creditAmount: 0, memo: input.memo });
        lines.push({ accountId: baseCredit.accountId, ledgerId, debitAmount: 0, creditAmount: totalTaxable, memo: input.memo });
        if (totalTax > 0) {
          lines.push({ accountId: vatOutputAcct.accountId, ledgerId: vatOutputAcct.ledgerId, debitAmount: 0, creditAmount: totalTax, memo: input.memo });
        }
        break;
      }

      default:
        // Reverse charge on AR side: customer self-assesses; post base-only
        lines.push({ accountId: baseDebit.accountId, ledgerId, debitAmount: totalTaxable, creditAmount: 0, memo: input.memo });
        lines.push({ accountId: baseCredit.accountId, ledgerId, debitAmount: 0, creditAmount: totalTaxable, memo: input.memo });
        break;
    }
  }

  validateBalance(lines);

  const fiscalPeriodId = getOrCreateOpenFiscalPeriodId(actor);
  const timestamp = now();
  const journalId = newId("JNL-");

  db.prepare(
    `INSERT INTO r2r_journal(journal_id, fiscal_period_id, ledger_id, description, state, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Posted', 2, ?, ?)`
  ).run(journalId, fiscalPeriodId, ledgerId, input.description, timestamp, timestamp);

  const { ledgerEntryIds } = insertJournalLines(journalId, lines, timestamp);

  appendEvent({ entityId: journalId, entityType: "Journal", eventType: "journal.created", version: 1, actor, payload: { fiscalPeriodId, ledgerId, description: input.description, sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId } });
  appendEvent({ entityId: journalId, entityType: "Journal", eventType: "journal.posted", version: 2, actor, payload: { sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId, taxLines: taxLines.length, applicability, totalTaxable, totalTax, grossAmount, ledgerEntryIds } });

  markTaxLinesPosted(input.sourceEntityId, journalId);

  return { journalId, ledgerEntryIds };
}
