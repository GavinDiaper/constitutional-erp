import { Router } from "express";
import { db } from "../db/connection";
import { HttpError } from "../utils/errors";

const tablePrimaryKeys = {
  event: "event_id",
  replay_checkpoint: "checkpoint_name",
  erp_mapping: "mapping_id",
  migration: "id",
  o2c_customer: "customer_id",
  o2c_quote: "quote_id",
  o2c_quote_line: "quote_line_id",
  o2c_sales_order: "order_id",
  o2c_sales_order_line: "order_line_id",
  o2c_invoice: "invoice_id",
  o2c_payment: "payment_id",
  p2p_supplier: "supplier_id",
  p2p_requisition: "requisition_id",
  p2p_requisition_line: "requisition_line_id",
  p2p_purchase_order: "po_id",
  p2p_purchase_order_line: "po_line_id",
  p2p_goods_receipt: "receipt_id",
  p2p_supplier_invoice: "supplier_invoice_id",
  p2p_ap_payment: "ap_payment_id",
  r2r_account: "account_id",
  r2r_fiscal_year: "fiscal_year_id",
  r2r_fiscal_period: "fiscal_period_id",
  r2r_journal: "journal_id",
  r2r_journal_line: "journal_line_id",
  r2r_ledger_entry: "ledger_entry_id",
  r2r_trial_balance_row: "trial_balance_row_id"
} as const;

type QueryTable = keyof typeof tablePrimaryKeys;

const queryTables = Object.keys(tablePrimaryKeys) as QueryTable[];

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "invalid_request", `Expected a non-negative integer but received '${value}'`);
  }

  return parsed;
}

function toQueryTable(input: string): QueryTable {
  if (!queryTables.includes(input as QueryTable)) {
    throw new HttpError(404, "not_found", `Unknown table '${input}'`);
  }

  return input as QueryTable;
}

export const queryRouter = Router();

queryRouter.get("/query/tables", (_req, res) => {
  res.json({
    data: queryTables.map((name) => ({ name, primaryKey: tablePrimaryKeys[name] }))
  });
});

queryRouter.get("/query/:table", (req, res) => {
  const table = toQueryTable(req.params.table);
  const limit = Math.min(parsePositiveInt(req.query.limit, 100), 500);
  const offset = parsePositiveInt(req.query.offset, 0);
  const rows = db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).all(limit, offset);

  res.json({
    data: rows,
    table,
    paging: {
      limit,
      offset,
      count: rows.length
    }
  });
});

queryRouter.get("/query/:table/:id", (req, res) => {
  const table = toQueryTable(req.params.table);
  const primaryKey = tablePrimaryKeys[table];
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${primaryKey} = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", `No row found in '${table}' for '${primaryKey}=${req.params.id}'`);
  }

  res.json({
    data: row,
    table,
    primaryKey
  });
});