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

function getJournal(journalId: string) {
  const row = db.prepare("SELECT * FROM r2r_journal WHERE journal_id = ?").get(journalId) as
    | {
        journal_id: string;
        fiscal_period_id: string;
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

export function createJournal(input: { fiscalPeriodId: string; description?: string }) {
  const fiscalPeriod = getFiscalPeriodById(input.fiscalPeriodId);
  if (fiscalPeriod.state !== "Open") {
    throw new HttpError(409, "invalid_transition", "Fiscal period must be Open to create journal");
  }

  const journalId = newId("JNL-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_journal(journal_id, fiscal_period_id, description, state, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', 1, ?, ?)`
    ).run(journalId, input.fiscalPeriodId, input.description ?? null, timestamp, timestamp);

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

  ensureAccountExists(input.accountId);

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
      input.debitAmount,
      input.creditAmount,
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
  return db
    .prepare(
      `SELECT
         account_id,
         SUM(debit_amount) AS debit_total,
         SUM(credit_amount) AS credit_total
       FROM r2r_ledger_entry le
       JOIN r2r_journal j ON j.journal_id = le.journal_id
       WHERE j.fiscal_period_id = ?
       GROUP BY account_id`
    )
    .all(fiscalPeriodId);
}
