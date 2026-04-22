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
  o2c_shipment: "shipment_id",
  p2p_supplier: "supplier_id",
  p2p_requisition: "requisition_id",
  p2p_requisition_line: "requisition_line_id",
  p2p_purchase_order: "po_id",
  p2p_purchase_order_line: "po_line_id",
  p2p_goods_receipt: "receipt_id",
  p2p_supplier_invoice: "supplier_invoice_id",
  p2p_ap_payment: "ap_payment_id",
  inv_sku: "sku_id",
  inv_organization: "organization_id",
  inv_on_hand: "on_hand_id",
  inv_movement: "movement_id",
  inv_reservation: "reservation_id",
  inv_bin: "bin_id",
  inv_bom_header: "bom_id",
  inv_bom_component: "component_id",
  r2r_account: "account_id",
  r2r_coa_combination_rule: "rule_id",
  r2r_coa_segment_definition: "segment_definition_id",
  r2r_fiscal_year: "fiscal_year_id",
  r2r_fiscal_period: "fiscal_period_id",
  r2r_fx_rate: "rate_id",
  r2r_fx_rate_type: "rate_type_id",
  r2r_journal: "journal_id",
  r2r_journal_line: "journal_line_id",
  r2r_legal_entity: "legal_entity_id",
  r2r_ledger: "ledger_id",
  r2r_ledger_entry: "ledger_entry_id",
  r2r_ledger_set: "ledger_set_id",
  r2r_ledger_set_member: "rowid",
  r2r_account_segment_value: "rowid",
  r2r_coa_combination_rule_condition: "condition_id",
  r2r_sla_posting_profile: "posting_profile_id",
  r2r_sla_posting_profile_line: "posting_profile_line_id",
  r2r_trial_balance_row: "trial_balance_row_id",
  h2r_employee: "employee_id",
  h2r_position: "position_id",
  h2r_assignment: "assignment_id",
  h2r_credential: "credential_id",
  h2r_authority_rule: "rule_id",
  repl_session: "session_id",
  navlog: "navlog_id",
  transcript: "transcript_id",
  governance_decision_log: "decision_id",
  tax_regime: "tax_regime_id",
  tax_jurisdiction: "tax_jurisdiction_id",
  tax_code: "tax_code_id",
  tax_rate: "tax_rate_id",
  tax_rule: "tax_rule_id",
  tax_account_mapping: "tax_account_mapping_id",
  tax_transaction_line: "tax_transaction_line_id",
  proj_project: "project_id",
  proj_wip: "wip_id",
  proj_bom_assignment: "assignment_id",
  proj_labor_entry: "entry_id",
  proj_finished_item: "finished_item_id",
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