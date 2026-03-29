import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

function now(): string {
  return new Date().toISOString();
}

export function createLedger(
  input: { name: string; currencyCode: string; calendar?: string; chartOfAccountsRef?: string },
  actor?: EventActor
) {
  const ledgerId = newId("LGR-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_ledger(ledger_id, name, currency_code, calendar, chart_of_accounts_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ledgerId,
      input.name,
      input.currencyCode,
      input.calendar ?? null,
      input.chartOfAccountsRef ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: ledgerId,
      entityType: "Ledger",
      eventType: "ledger.created",
      version: 1,
      actor,
      payload: { name: input.name, currencyCode: input.currencyCode }
    });
  });

  return getLedgerById(ledgerId);
}

export function getLedgerById(ledgerId: string) {
  const row = db.prepare("SELECT * FROM r2r_ledger WHERE ledger_id = ?").get(ledgerId);
  if (!row) {
    throw new HttpError(404, "not_found", "Ledger not found");
  }
  return row;
}

export function listLedgers() {
  return db.prepare("SELECT * FROM r2r_ledger ORDER BY created_at DESC LIMIT 100").all();
}
