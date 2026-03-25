import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

function now(): string {
  return new Date().toISOString();
}

export function createAccount(input: { accountCode: string; accountName: string; accountType: string }) {
  const accountId = newId("ACC-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_account(account_id, account_code, account_name, account_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(accountId, input.accountCode, input.accountName, input.accountType, timestamp, timestamp);

    appendEvent({
      entityId: accountId,
      entityType: "Account",
      eventType: "AccountCreated",
      version: 1,
      payload: input
    });
  });

  return getAccountById(accountId);
}

export function listAccounts() {
  return db.prepare("SELECT * FROM r2r_account ORDER BY account_code ASC LIMIT 500").all();
}

export function getAccountById(accountId: string) {
  const row = db.prepare("SELECT * FROM r2r_account WHERE account_id = ?").get(accountId);
  if (!row) {
    throw new HttpError(404, "not_found", "Account not found");
  }

  return row;
}

export function ensureAccountExists(accountId: string) {
  const row = db.prepare("SELECT account_id FROM r2r_account WHERE account_id = ?").get(accountId);
  if (!row) {
    throw new HttpError(404, "not_found", "Account not found");
  }
}
