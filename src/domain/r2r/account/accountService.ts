import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

type AccountRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_account_id: string | null;
};

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

export function createAccount(input: {
  accountCode: string;
  accountName: string;
  accountType: string;
  parentAccountId?: string;
}) {
  const accountId = newId("ACC-");
  const timestamp = now();
  const accountType = normalizeAccountType(input.accountType);

  if (input.parentAccountId) {
    ensureAccountExists(input.parentAccountId);
  }

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_account(account_id, account_code, account_name, account_type, parent_account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      accountId,
      input.accountCode,
      input.accountName,
      accountType,
      input.parentAccountId ?? null,
      timestamp,
      timestamp
    );

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

export function listAccountHierarchy() {
  const rows = db.prepare("SELECT * FROM r2r_account ORDER BY account_code ASC LIMIT 1000").all() as AccountRow[];

  const nodeMap = new Map<string, AccountRow & { children: Array<AccountRow & { children: any[] }> }>();
  for (const row of rows) {
    nodeMap.set(row.account_id, { ...row, children: [] });
  }

  const roots: Array<AccountRow & { children: any[] }> = [];

  for (const row of rows) {
    const node = nodeMap.get(row.account_id)!;
    if (row.parent_account_id) {
      const parent = nodeMap.get(row.parent_account_id);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  return roots;
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

export function createSegmentDefinition(input: {
  code: string;
  name: string;
  sortOrder: number;
  isRequired?: boolean;
}) {
  const segmentDefinitionId = newId("SEG-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_coa_segment_definition(segment_definition_id, code, name, sort_order, is_required, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      segmentDefinitionId,
      input.code,
      input.name,
      input.sortOrder,
      input.isRequired ? 1 : 0,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: segmentDefinitionId,
      entityType: "COASegmentDefinition",
      eventType: "coa-segment-definition.created",
      version: 1,
      payload: {
        code: input.code,
        name: input.name,
        sortOrder: input.sortOrder,
        isRequired: Boolean(input.isRequired)
      }
    });
  });

  return getSegmentDefinitionById(segmentDefinitionId);
}

export function getSegmentDefinitionById(segmentDefinitionId: string) {
  const row = db
    .prepare("SELECT * FROM r2r_coa_segment_definition WHERE segment_definition_id = ?")
    .get(segmentDefinitionId);

  if (!row) {
    throw new HttpError(404, "not_found", "COA segment definition not found");
  }

  return row;
}

export function listSegmentDefinitions() {
  return db
    .prepare("SELECT * FROM r2r_coa_segment_definition ORDER BY sort_order ASC, code ASC LIMIT 200")
    .all();
}

function ensureSegmentDefinitionExists(segmentDefinitionId: string) {
  const row = db
    .prepare("SELECT segment_definition_id FROM r2r_coa_segment_definition WHERE segment_definition_id = ?")
    .get(segmentDefinitionId);

  if (!row) {
    throw new HttpError(404, "not_found", "COA segment definition not found");
  }
}

export function setAccountSegments(input: {
  accountId: string;
  values: Array<{ segmentDefinitionId: string; value: string }>;
}) {
  ensureAccountExists(input.accountId);

  const timestamp = now();

  transaction(() => {
    const remove = db.prepare("DELETE FROM r2r_account_segment_value WHERE account_id = ?");
    remove.run(input.accountId);

    const upsert = db.prepare(
      `INSERT INTO r2r_account_segment_value(account_id, segment_definition_id, segment_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, segment_definition_id)
       DO UPDATE SET segment_value = excluded.segment_value, updated_at = excluded.updated_at`
    );

    for (const value of input.values) {
      ensureSegmentDefinitionExists(value.segmentDefinitionId);
      upsert.run(input.accountId, value.segmentDefinitionId, value.value, timestamp, timestamp);
    }

    appendEvent({
      entityId: input.accountId,
      entityType: "Account",
      eventType: "account.segments_set",
      version: 1,
      payload: {
        values: input.values
      }
    });
  });

  return listAccountSegments(input.accountId);
}

export function listAccountSegments(accountId: string) {
  ensureAccountExists(accountId);

  return db
    .prepare(
      `SELECT
         sv.account_id,
         sv.segment_definition_id,
         d.code,
         d.name,
         d.sort_order,
         d.is_required,
         sv.segment_value
       FROM r2r_account_segment_value sv
       JOIN r2r_coa_segment_definition d ON d.segment_definition_id = sv.segment_definition_id
       WHERE sv.account_id = ?
       ORDER BY d.sort_order ASC, d.code ASC`
    )
    .all(accountId);
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
