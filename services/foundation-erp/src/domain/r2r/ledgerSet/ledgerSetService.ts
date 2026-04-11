import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";

function now(): string {
  return new Date().toISOString();
}

function ensureLedgerExists(ledgerId: string) {
  const row = db.prepare("SELECT ledger_id FROM r2r_ledger WHERE ledger_id = ?").get(ledgerId);
  if (!row) {
    throw new HttpError(404, "not_found", "Ledger not found");
  }
}

export function createLedgerSet(input: { name: string }, actor?: EventActor) {
  const ledgerSetId = newId("LSET-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_ledger_set(ledger_set_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(ledgerSetId, input.name, timestamp, timestamp);

    appendEvent({
      entityId: ledgerSetId,
      entityType: "LedgerSet",
      eventType: "ledger-set.created",
      version: 1,
      actor,
      payload: { name: input.name }
    });
  });

  return getLedgerSetById(ledgerSetId);
}

export function getLedgerSetById(ledgerSetId: string) {
  const row = db.prepare("SELECT * FROM r2r_ledger_set WHERE ledger_set_id = ?").get(ledgerSetId);
  if (!row) {
    throw new HttpError(404, "not_found", "Ledger set not found");
  }

  return row;
}

export function listLedgerSets() {
  return db.prepare("SELECT * FROM r2r_ledger_set ORDER BY created_at DESC LIMIT 200").all();
}

export function addLedgerToSet(input: { ledgerSetId: string; ledgerId: string }, actor?: EventActor) {
  getLedgerSetById(input.ledgerSetId);
  ensureLedgerExists(input.ledgerId);

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO r2r_ledger_set_member(ledger_set_id, ledger_id, created_at)
       VALUES (?, ?, ?)`
    ).run(input.ledgerSetId, input.ledgerId, timestamp);

    appendEvent({
      entityId: input.ledgerSetId,
      entityType: "LedgerSet",
      eventType: "ledger-set.member_added",
      version: 1,
      actor,
      payload: { ledgerId: input.ledgerId }
    });
  });

  return { ledgerSetId: input.ledgerSetId, ledgerId: input.ledgerId };
}

export function listLedgerSetMembers(ledgerSetId: string) {
  getLedgerSetById(ledgerSetId);

  return db
    .prepare(
      `SELECT l.*
       FROM r2r_ledger_set_member m
       JOIN r2r_ledger l ON l.ledger_id = m.ledger_id
       WHERE m.ledger_set_id = ?
       ORDER BY m.created_at DESC`
    )
    .all(ledgerSetId);
}