import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureAccountExists } from "../account/accountService";
import { getFiscalPeriodById } from "../fiscal/fiscalService";

type JournalState = "Draft" | "Posted" | "Reversed" | "Cancelled";

const transitions: Record<JournalState, JournalState[]> = {
  Draft: ["Posted", "Cancelled"],
  Posted: ["Reversed"],
  Reversed: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function assertValidJournalLine(debitAmount: number, creditAmount: number) {
  if (!Number.isFinite(debitAmount) || !Number.isFinite(creditAmount)) {
    throw new HttpError(400, "invalid_journal_line", "Debit and credit amounts must be valid numbers");
  }

  if (debitAmount < 0 || creditAmount < 0) {
    throw new HttpError(400, "invalid_journal_line", "Debit and credit amounts must be non-negative");
  }

  const debitCents = toCents(debitAmount);
  const creditCents = toCents(creditAmount);
  const hasDebit = debitCents > 0;
  const hasCredit = creditCents > 0;

  if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
    throw new HttpError(400, "invalid_journal_line", "Each journal line must have either a debit amount or a credit amount");
  }
}

function assertBalancedForPosting(
  lines: Array<{ account_id: string; debit_amount: number; credit_amount: number }>
) {
  if (lines.length < 2) {
    throw new HttpError(409, "unbalanced_journal", "Journal must contain at least two lines before posting");
  }

  const distinctAccounts = new Set(lines.map((line) => line.account_id));
  if (distinctAccounts.size < 2) {
    throw new HttpError(409, "unbalanced_journal", "Journal must affect at least two accounts before posting");
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const line of lines) {
    assertValidJournalLine(line.debit_amount, line.credit_amount);
    totalDebitCents += toCents(line.debit_amount);
    totalCreditCents += toCents(line.credit_amount);
  }

  if (totalDebitCents !== totalCreditCents) {
    throw new HttpError(409, "unbalanced_journal", "Journal debits must equal credits before posting");
  }
}

function getJournal(journalId: string) {
  const row = db.prepare("SELECT * FROM r2r_journal WHERE journal_id = ?").get(journalId) as
    | {
        journal_id: string;
        fiscal_period_id: string;
        ledger_id: string | null;
        description: string;
        state: JournalState;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Journal not found");
  }

  return row;
}

function assertTransition(fromState: JournalState, toState: JournalState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition journal from ${fromState} to ${toState}`);
  }
}

export function createJournal(input: { fiscalPeriodId: string; ledgerId?: string; description?: string }) {
  const fiscalPeriod = getFiscalPeriodById(input.fiscalPeriodId);
  if (fiscalPeriod.state !== "Open") {
    throw new HttpError(409, "invalid_transition", "Fiscal period must be Open to create journal");
  }

  if (input.ledgerId) {
    const ledger = db
      .prepare("SELECT ledger_id FROM r2r_ledger WHERE ledger_id = ?")
      .get(input.ledgerId) as { ledger_id: string } | undefined;

    if (!ledger) {
      throw new HttpError(404, "not_found", "Ledger not found");
    }
  }

  const journalId = newId("JNL-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_journal(journal_id, fiscal_period_id, ledger_id, description, state, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Draft', 1, ?, ?)`
    ).run(
      journalId,
      input.fiscalPeriodId,
      input.ledgerId ?? null,
      input.description ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: journalId,
      entityType: "Journal",
      eventType: "journal.created",
      version: 1,
      payload: input
    });
  });

  return getJournal(journalId);
}

export function addJournalLine(input: {
  journalId: string;
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  memo?: string;
}) {
  const journal = getJournal(input.journalId);
  if (journal.state !== "Draft") {
    throw new HttpError(409, "invalid_transition", "Journal lines can only be added in Draft state");
  }

  assertValidJournalLine(input.debitAmount, input.creditAmount);

  ensureAccountExists(input.accountId);

  if (journal.ledger_id) {
    const account = db
      .prepare("SELECT ledger_id FROM r2r_account WHERE account_id = ?")
      .get(input.accountId) as { ledger_id: string | null } | undefined;

    if (!account) {
      throw new HttpError(404, "not_found", "Account not found");
    }

    if (account.ledger_id !== journal.ledger_id) {
      throw new HttpError(
        409,
        "ledger_mismatch",
        "Journal account must belong to the same ledger as the journal"
      );
    }
  }

  const journalLineId = newId("JNL-L-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_journal_line(journal_line_id, journal_id, account_id, debit_amount, credit_amount, memo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      journalLineId,
      input.journalId,
      input.accountId,
      toCents(input.debitAmount) / 100,
      toCents(input.creditAmount) / 100,
      input.memo ?? null,
      timestamp
    );

    appendEvent({
      entityId: input.journalId,
      entityType: "Journal",
      eventType: "journal.line_added",
      version: 1,
      payload: { ...input, journalLineId }
    });
  });

  return { journalLineId };
}

export function listJournals() {
  return db.prepare("SELECT * FROM r2r_journal ORDER BY created_at DESC LIMIT 100").all();
}

export function getJournalById(journalId: string) {
  return getJournal(journalId);
}

export function updateJournalState(journalId: string, toState: JournalState, actor?: EventActor) {
  const journal = getJournal(journalId);
  assertTransition(journal.state, toState);

  const nextVersion = journal.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE r2r_journal SET state = ?, version = ?, updated_at = ? WHERE journal_id = ?")
      .run(toState, nextVersion, timestamp, journalId);

    if (toState === "Posted") {
      const lines = db
        .prepare(
          "SELECT account_id, debit_amount, credit_amount FROM r2r_journal_line WHERE journal_id = ?"
        )
        .all(journalId) as Array<{ account_id: string; debit_amount: number; credit_amount: number }>;

      assertBalancedForPosting(lines);

      const insertLedger = db.prepare(
        `INSERT INTO r2r_ledger_entry(ledger_entry_id, journal_id, account_id, posting_date, debit_amount, credit_amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const line of lines) {
        insertLedger.run(
          newId("LED-") ,
          journalId,
          line.account_id,
          timestamp,
          line.debit_amount,
          line.credit_amount,
          timestamp
        );
      }
    }

    appendEvent({
      entityId: journalId,
      entityType: "Journal",
      eventType: `journal.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: journal.state, to: toState }
    });
  });

  return getJournal(journalId);
}

export function postJournal(journalId: string, actor?: EventActor) {
  return updateJournalState(journalId, "Posted", actor);
}

export function reverseJournal(journalId: string, actor?: EventActor) {
  return updateJournalState(journalId, "Reversed", actor);
}

export function cancelJournal(journalId: string, actor?: EventActor) {
  return updateJournalState(journalId, "Cancelled", actor);
}

export function getTrialBalance(fiscalPeriodId: string) {
  const period = getFiscalPeriodById(fiscalPeriodId);

  // Get the fiscal year to find prior periods
  const fiscalYear = db
    .prepare("SELECT * FROM r2r_fiscal_year WHERE fiscal_year_id = ?")
    .get(period.fiscal_year_id) as { fiscal_year_id: string; year_label: string; start_date: string; end_date: string } | undefined;

  if (!fiscalYear) {
    throw new Error("Fiscal year not found for period");
  }

  // Query includes:
  // 1. Opening balance from period 0 (year-opening) if it exists for this fiscal year
  // 2. All periods BEFORE the current period in the same fiscal year
  // 3. ALL periods from prior fiscal years (to get historic carry-forward)
  const rows = db
    .prepare(
      `SELECT
         le.account_id,
         SUM(le.debit_amount) AS debit_total,
         SUM(le.credit_amount) AS credit_total
       FROM r2r_ledger_entry le
       JOIN r2r_journal j ON j.journal_id = le.journal_id
       JOIN r2r_fiscal_period fp ON fp.fiscal_period_id = j.fiscal_period_id
       JOIN r2r_fiscal_year fy ON fy.fiscal_year_id = fp.fiscal_year_id
       WHERE (
         -- Include this period's entries
         j.fiscal_period_id = ?
         OR
         -- Include prior periods in the same fiscal year
         (fp.fiscal_year_id = ? AND fp.period_number < (SELECT period_number FROM r2r_fiscal_period WHERE fiscal_period_id = ?))
         OR
         -- Include all periods from prior fiscal years (brought-forward logic)
         fy.end_date < ?
       )
       GROUP BY le.account_id`
    )
    .all(
      fiscalPeriodId,
      period.fiscal_year_id,
      fiscalPeriodId,
      fiscalYear.start_date
    ) as Array<{
      account_id: string;
      debit_total: number;
      credit_total: number;
    }>;

  const timestamp = now();

  transaction(() => {
    db.prepare("DELETE FROM r2r_trial_balance_row WHERE fiscal_period_id = ?").run(fiscalPeriodId);

    const insertRow = db.prepare(
      `INSERT INTO r2r_trial_balance_row(trial_balance_row_id, fiscal_period_id, account_id, debit_total, credit_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const row of rows) {
      insertRow.run(
        newId("TBR-"),
        fiscalPeriodId,
        row.account_id,
        row.debit_total ?? 0,
        row.credit_total ?? 0,
        timestamp
      );
    }
  });

  return rows;
}
