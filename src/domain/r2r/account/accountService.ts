import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense"
};

const STARTER_ACCOUNTS: Array<{ accountCode: string; accountName: string; accountType: AccountType }> = [
  { accountCode: "SYS-100-ASSET-CASH", accountName: "Cash and Cash Equivalents", accountType: "Asset" },
  { accountCode: "SYS-110-ASSET-AR", accountName: "Accounts Receivable", accountType: "Asset" },
  { accountCode: "SYS-200-LIAB-AP", accountName: "Accounts Payable", accountType: "Liability" },
  { accountCode: "SYS-300-EQ-RE", accountName: "Retained Earnings", accountType: "Equity" },
  { accountCode: "SYS-400-REV-SALES", accountName: "Sales Revenue", accountType: "Revenue" },
  { accountCode: "SYS-500-EXP-COGS", accountName: "Cost of Goods Sold", accountType: "Expense" },
  { accountCode: "SYS-510-EXP-OPEX", accountName: "Operating Expense", accountType: "Expense" }
];

function now(): string {
  return new Date().toISOString();
}

function normalizeAccountType(accountType: string): AccountType {
  const normalized = ACCOUNT_TYPE_MAP[accountType.trim().toLowerCase()];
  if (!normalized) {
    throw new HttpError(400, "invalid_account_type", "Account type must be one of Asset, Liability, Equity, Revenue, Expense");
  }

  return normalized;
}

export function createAccount(input: { accountCode: string; accountName: string; accountType: string }) {
  const accountId = newId("ACC-");
  const timestamp = now();
  const accountType = normalizeAccountType(input.accountType);

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_account(account_id, account_code, account_name, account_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(accountId, input.accountCode, input.accountName, accountType, timestamp, timestamp);

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

export function seedStarterAccounts() {
  const timestamp = now();

  transaction(() => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO r2r_account(account_id, account_code, account_name, account_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const account of STARTER_ACCOUNTS) {
      insert.run(newId("ACC-"), account.accountCode, account.accountName, account.accountType, timestamp, timestamp);
    }
  });
}
