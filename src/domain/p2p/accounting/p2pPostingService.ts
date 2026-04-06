import { db } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";

function now(): string {
  return new Date().toISOString();
}

function normalizeMoney(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new HttpError(400, "invalid_amount", "Posting amount must be a non-negative number");
  }

  return Math.round(amount * 100) / 100;
}

function getAccountByCode(accountCode: string): { accountId: string; ledgerId: string | null } {
  const row = db
    .prepare("SELECT account_id, ledger_id FROM r2r_account WHERE account_code = ?")
    .get(accountCode) as { account_id: string; ledger_id: string | null } | undefined;

  if (!row) {
    throw new HttpError(409, "missing_account", `Required posting account '${accountCode}' is not configured`);
  }

  return {
    accountId: row.account_id,
    ledgerId: row.ledger_id ?? null
  };
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

function resolveSourceLedgerId(referenceEntityType: string, referenceEntityId: string): string | null {
  switch (referenceEntityType) {
    case "Payment": {
      const row = db
        .prepare(
          `SELECT so.legal_entity_id
           FROM o2c_payment p
           JOIN o2c_invoice i ON i.invoice_id = p.invoice_id
           JOIN o2c_sales_order so ON so.order_id = i.order_id
           WHERE p.payment_id = ?`
        )
        .get(referenceEntityId) as { legal_entity_id: string | null } | undefined;

      return getLedgerIdForLegalEntity(row?.legal_entity_id);
    }

    case "ApPayment": {
      const row = db
        .prepare(
          `SELECT po.legal_entity_id
           FROM p2p_ap_payment ap
           JOIN p2p_supplier_invoice si ON si.supplier_invoice_id = ap.supplier_invoice_id
           JOIN p2p_purchase_order po ON po.po_id = si.po_id
           WHERE ap.ap_payment_id = ?`
        )
        .get(referenceEntityId) as { legal_entity_id: string | null } | undefined;

      return getLedgerIdForLegalEntity(row?.legal_entity_id);
    }

    default:
      return null;
  }
}

function findOpenFiscalPeriodId(): string | null {
  const row = db
    .prepare(
      `SELECT fiscal_period_id
       FROM r2r_fiscal_period
       WHERE state = 'Open'
       ORDER BY start_date DESC, created_at DESC
       LIMIT 1`
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
    ).run(
      fiscalYearId,
      fiscalYearLabel,
      `${year}-01-01T00:00:00.000Z`,
      `${year}-12-31T23:59:59.999Z`,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: fiscalYearId,
      entityType: "FiscalYear",
      eventType: "fiscal-year.created",
      version: 1,
      actor,
      payload: {
        yearLabel: fiscalYearLabel,
        startDate: `${year}-01-01T00:00:00.000Z`,
        endDate: `${year}-12-31T23:59:59.999Z`
      }
    });
  }

  const periodNumber = currentDate.getUTCMonth() + 1;
  const existingPeriod = db
    .prepare(
      `SELECT fiscal_period_id
       FROM r2r_fiscal_period
       WHERE fiscal_year_id = ? AND period_number = ?
       LIMIT 1`
    )
    .get(fiscalYearId, periodNumber) as { fiscal_period_id: string } | undefined;

  const fiscalPeriodId = existingPeriod?.fiscal_period_id ?? newId("FP-");

  if (existingPeriod) {
    db.prepare("UPDATE r2r_fiscal_period SET state = 'Open', updated_at = ? WHERE fiscal_period_id = ?")
      .run(timestamp, fiscalPeriodId);
    return fiscalPeriodId;
  }

  const periodStart = new Date(Date.UTC(year, currentDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, currentDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  db.prepare(
    `INSERT INTO r2r_fiscal_period(fiscal_period_id, fiscal_year_id, period_number, state, start_date, end_date, created_at, updated_at)
     VALUES (?, ?, ?, 'Open', ?, ?, ?, ?)`
  ).run(
    fiscalPeriodId,
    fiscalYearId,
    periodNumber,
    periodStart.toISOString(),
    periodEnd.toISOString(),
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: fiscalPeriodId,
    entityType: "FiscalPeriod",
    eventType: "fiscal-period.created",
    version: 1,
    actor,
    payload: {
      fiscalYearId,
      periodNumber,
      startDate: periodStart.toISOString(),
      endDate: periodEnd.toISOString()
    }
  });

  return fiscalPeriodId;
}

function getOrCreateOpenFiscalPeriodId(actor?: EventActor): string {
  return findOpenFiscalPeriodId() ?? createSystemOpenFiscalPeriod(actor);
}

export function createAndPostP2PJournal(input: {
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
  memo?: string;
  referenceEntityType: string;
  referenceEntityId: string;
}, actor?: EventActor): { journalId: string; ledgerEntryIds: [string, string] } {
  const amount = normalizeMoney(input.amount);
  if (amount === 0) {
    throw new HttpError(409, "invalid_amount", "Posting amount must be greater than zero");
  }

  const fiscalPeriodId = getOrCreateOpenFiscalPeriodId(actor);
  const debitAccount = getAccountByCode(input.debitAccountCode);
  const creditAccount = getAccountByCode(input.creditAccountCode);
  const sourceLedgerId = resolveSourceLedgerId(input.referenceEntityType, input.referenceEntityId);
  const ledgerId = sourceLedgerId ?? debitAccount.ledgerId;

  if (!ledgerId) {
    throw new HttpError(
      409,
      "ledger_mismatch",
      "P2P posting requires a resolved ledger assignment"
    );
  }

  if (!sourceLedgerId && (!debitAccount.ledgerId || !creditAccount.ledgerId || debitAccount.ledgerId !== creditAccount.ledgerId)) {
    throw new HttpError(
      409,
      "ledger_mismatch",
      "P2P posting accounts must belong to the same ledger and have ledger assignments"
    );
  }

  const debitAccountId = debitAccount.accountId;
  const creditAccountId = creditAccount.accountId;

  const timestamp = now();
  const journalId = newId("JNL-");
  const debitLineId = newId("JNL-L-");
  const creditLineId = newId("JNL-L-");
  const debitLedgerEntryId = newId("LED-");
  const creditLedgerEntryId = newId("LED-");

  db.prepare(
     `INSERT INTO r2r_journal(journal_id, fiscal_period_id, ledger_id, description, state, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Posted', 2, ?, ?)`
    ).run(journalId, fiscalPeriodId, ledgerId, input.description, timestamp, timestamp);

  db.prepare(
    `INSERT INTO r2r_journal_line(journal_line_id, journal_id, account_id, debit_amount, credit_amount, memo, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(debitLineId, journalId, debitAccountId, amount, input.memo ?? null, timestamp);

  db.prepare(
    `INSERT INTO r2r_journal_line(journal_line_id, journal_id, account_id, debit_amount, credit_amount, memo, created_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).run(creditLineId, journalId, creditAccountId, amount, input.memo ?? null, timestamp);

  db.prepare(
    `INSERT INTO r2r_ledger_entry(ledger_entry_id, journal_id, account_id, posting_date, debit_amount, credit_amount, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(debitLedgerEntryId, journalId, debitAccountId, timestamp, amount, timestamp);

  db.prepare(
    `INSERT INTO r2r_ledger_entry(ledger_entry_id, journal_id, account_id, posting_date, debit_amount, credit_amount, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(creditLedgerEntryId, journalId, creditAccountId, timestamp, amount, timestamp);

  appendEvent({
    entityId: journalId,
    entityType: "Journal",
    eventType: "journal.created",
    version: 1,
    actor,
    payload: {
      fiscalPeriodId,
      ledgerId,
      description: input.description,
      sourceEntityType: input.referenceEntityType,
      sourceEntityId: input.referenceEntityId
    }
  });

  appendEvent({
    entityId: journalId,
    entityType: "Journal",
    eventType: "journal.posted",
    version: 2,
    actor,
    payload: {
      sourceEntityType: input.referenceEntityType,
      sourceEntityId: input.referenceEntityId,
      amount,
      debitAccountId,
      creditAccountId,
      ledgerEntryIds: [debitLedgerEntryId, creditLedgerEntryId]
    }
  });

  return {
    journalId,
    ledgerEntryIds: [debitLedgerEntryId, creditLedgerEntryId]
  };
}
