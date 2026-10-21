import { db } from "../../db/connection";

export type ReadDomain = "o2c" | "p2p" | "r2r" | "h2r" | "inv" | "bom" | "proj" | "tax" | "itr" | "sys";

// Single whitelist for both GET /query/* and the generated MCP read tools.
export interface ReadModelEntry {
  table: string;
  // Absent for views without a natural key: list/describe only.
  primaryKey?: string;
  domain: ReadDomain;
  // snake_case singular name used in tool names, e.g. "position" gives h2r_get_position.
  entity: string;
  plural: string;
  labelColumns: string[];
  searchColumns: string[];
  stateColumn?: string;
  // Never returned by MCP read tools (PII/secrets).
  excludeColumns: string[];
  // false keeps the table in /query but gives it no MCP read tools.
  mcp: boolean;
}

interface EntryOptions {
  label?: string[];
  search?: string[];
  state?: string;
  exclude?: string[];
  plural?: string;
  mcp?: boolean;
}

function pluralize(entity: string): string {
  if (/(s|x)$/.test(entity)) return entity;
  if (/[^aeiou]y$/.test(entity)) return `${entity.slice(0, -1)}ies`;
  return `${entity}s`;
}

function entry(
  table: string,
  primaryKey: string | undefined,
  domain: ReadDomain,
  entity: string,
  options: EntryOptions = {}
): ReadModelEntry {
  const labelColumns = options.label ?? [];
  return {
    table,
    primaryKey,
    domain,
    entity,
    plural: options.plural ?? pluralize(entity),
    labelColumns,
    searchColumns: options.search ?? [...labelColumns, ...(primaryKey && primaryKey !== "rowid" ? [primaryKey] : [])],
    stateColumn: options.state,
    excludeColumns: options.exclude ?? [],
    mcp: options.mcp ?? true
  };
}

export const readModel: ReadModelEntry[] = [
  // ── O2C ────────────────────────────────────────────────────────────────────
  entry("o2c_customer", "customer_id", "o2c", "customer", { label: ["customer_name"], search: ["customer_name", "email", "customer_id"], state: "status" }),
  entry("o2c_contract", "contract_id", "o2c", "contract", { label: ["name"], search: ["name", "external_reference", "contract_id"], state: "status" }),
  entry("o2c_contract_version", "contract_version_id", "o2c", "contract_version", { label: ["version_number"], state: "status" }),
  entry("o2c_quote", "quote_id", "o2c", "quote", { label: ["quote_id"], state: "state" }),
  entry("o2c_quote_line", "quote_line_id", "o2c", "quote_line", { label: ["quote_line_id"] }),
  entry("o2c_sales_order", "order_id", "o2c", "sales_order", { label: ["order_id"], state: "state" }),
  entry("o2c_sales_order_line", "order_line_id", "o2c", "sales_order_line", { label: ["order_line_id"] }),
  entry("o2c_invoice", "invoice_id", "o2c", "invoice", { label: ["invoice_id"], state: "state" }),
  entry("o2c_invoice_line", "invoice_line_id", "o2c", "invoice_line", { label: ["invoice_line_id"] }),
  entry("o2c_payment", "payment_id", "o2c", "payment", { label: ["payment_id"], state: "state" }),
  entry("o2c_shipment", "shipment_id", "o2c", "shipment", { label: ["tracking_number"], search: ["tracking_number", "shipment_id"], state: "state" }),

  // ── P2P ────────────────────────────────────────────────────────────────────
  entry("p2p_supplier", "supplier_id", "p2p", "supplier", { label: ["supplier_name"], search: ["supplier_name", "email", "supplier_id"], state: "status" }),
  entry("p2p_requisition", "requisition_id", "p2p", "requisition", { label: ["requisition_id"], state: "state" }),
  entry("p2p_requisition_line", "requisition_line_id", "p2p", "requisition_line", { label: ["description"] }),
  entry("p2p_purchase_order", "po_id", "p2p", "purchase_order", { label: ["po_id"], state: "state" }),
  entry("p2p_purchase_order_line", "po_line_id", "p2p", "purchase_order_line", { label: ["description"] }),
  entry("p2p_goods_receipt", "receipt_id", "p2p", "goods_receipt", { label: ["receipt_id"], state: "state" }),
  entry("p2p_supplier_invoice", "supplier_invoice_id", "p2p", "supplier_invoice", { label: ["supplier_invoice_id"], state: "state" }),
  entry("p2p_supplier_invoice_timesheet_accrual", "rowid", "p2p", "supplier_invoice_timesheet_accrual"),
  entry("p2p_ap_payment", "ap_payment_id", "p2p", "ap_payment", { label: ["ap_payment_id"], state: "state" }),

  // ── R2R ────────────────────────────────────────────────────────────────────
  entry("r2r_account", "account_id", "r2r", "account", { label: ["account_name"], search: ["account_code", "account_name", "account_id"] }),
  entry("r2r_account_segment_value", "rowid", "r2r", "account_segment_value"),
  entry("r2r_coa_combination_rule", "rule_id", "r2r", "coa_combination_rule", { label: ["name"], search: ["name", "description", "rule_id"] }),
  entry("r2r_coa_combination_rule_condition", "condition_id", "r2r", "coa_combination_rule_condition"),
  entry("r2r_coa_segment_definition", "segment_definition_id", "r2r", "coa_segment_definition", { label: ["name"], search: ["code", "name", "segment_definition_id"] }),
  entry("r2r_cost_element", "cost_element_id", "r2r", "cost_element", { label: ["cost_element_name"], search: ["cost_element_name", "cost_element_type", "cost_element_id"] }),
  entry("r2r_fiscal_year", "fiscal_year_id", "r2r", "fiscal_year", { label: ["year_label"], state: "state" }),
  entry("r2r_fiscal_period", "fiscal_period_id", "r2r", "fiscal_period", { label: ["period_number"], state: "state" }),
  entry("r2r_fx_rate", "rate_id", "r2r", "fx_rate"),
  entry("r2r_fx_rate_type", "rate_type_id", "r2r", "fx_rate_type", { label: ["name"], search: ["code", "name", "description", "rate_type_id"] }),
  entry("r2r_journal", "journal_id", "r2r", "journal", { label: ["description"], search: ["description", "journal_id"], state: "state" }),
  entry("r2r_journal_line", "journal_line_id", "r2r", "journal_line"),
  entry("r2r_journal_reversal", "original_journal_id", "r2r", "journal_reversal"),
  entry("r2r_ledger", "ledger_id", "r2r", "ledger", { label: ["name"], search: ["name", "ledger_id"] }),
  entry("r2r_ledger_entry", "ledger_entry_id", "r2r", "ledger_entry", { plural: "ledger_entries" }),
  entry("r2r_ledger_set", "ledger_set_id", "r2r", "ledger_set", { label: ["name"], search: ["name", "ledger_set_id"] }),
  entry("r2r_ledger_set_member", "rowid", "r2r", "ledger_set_member"),
  entry("r2r_legal_entity", "legal_entity_id", "r2r", "legal_entity", { label: ["name"], search: ["name", "legal_entity_id"], plural: "legal_entities" }),
  entry("r2r_sla_posting_profile", "posting_profile_id", "r2r", "sla_posting_profile", { label: ["name"], search: ["name", "event_type", "description", "posting_profile_id"] }),
  entry("r2r_sla_posting_profile_line", "posting_profile_line_id", "r2r", "sla_posting_profile_line"),
  entry("r2r_trial_balance_row", "trial_balance_row_id", "r2r", "trial_balance_row"),

  // ── H2R ────────────────────────────────────────────────────────────────────
  entry("h2r_employee", "employee_id", "h2r", "employee", { label: ["name"], search: ["name", "employee_id"], state: "status", exclude: ["email"], plural: "employees" }),
  entry("h2r_position", "position_id", "h2r", "position", { label: ["title"], search: ["title", "department", "position_id"] }),
  entry("h2r_assignment", "assignment_id", "h2r", "assignment", { state: "state" }),
  entry("h2r_credential", "credential_id", "h2r", "credential", { label: ["type"], state: "status" }),
  entry("h2r_authority_rule", "rule_id", "h2r", "authority_rule"),
  entry("h2r_contractor_accrual", "accrual_id", "h2r", "contractor_accrual", { state: "status" }),
  entry("h2r_employee_availability", "availability_id", "h2r", "employee_availability", { plural: "employee_availability" }),
  entry("h2r_employee_cost_rate", "employee_cost_rate_id", "h2r", "employee_cost_rate", { state: "status" }),
  entry("h2r_employee_skill", "skill_id", "h2r", "employee_skill", { label: ["skill_name"], search: ["skill_name", "skill_id"] }),
  entry("h2r_labor_rate_card", "rate_card_id", "h2r", "labor_rate_card", { label: ["rate_card_type"] }),
  entry("h2r_timesheet", "timesheet_id", "h2r", "timesheet", { state: "status" }),
  entry("h2r_timesheet_import_batch", "import_batch_id", "h2r", "timesheet_import_batch", { state: "status" }),
  entry("h2r_timesheet_line", "timesheet_line_id", "h2r", "timesheet_line", { label: ["description"] }),
  entry("h2r_vendor_rate", "vendor_rate_id", "h2r", "vendor_rate", { label: ["vendor_name"], search: ["vendor_name", "vendor_rate_id"], state: "status" }),

  // ── INV ────────────────────────────────────────────────────────────────────
  entry("inv_sku", "sku_id", "inv", "sku", { label: ["sku_code"], search: ["sku_code", "description", "sku_id"] }),
  entry("inv_organization", "organization_id", "inv", "organization", { label: ["name"], search: ["name", "organization_id"] }),
  entry("inv_on_hand", "on_hand_id", "inv", "on_hand", { plural: "on_hand" }),
  entry("inv_movement", "movement_id", "inv", "movement"),
  entry("inv_reservation", "reservation_id", "inv", "reservation", { state: "status" }),
  entry("inv_bin", "bin_id", "inv", "bin", { label: ["bin_code"], search: ["bin_code", "bin_id"] }),
  entry("inv_bin_balance", "bin_balance_id", "inv", "bin_balance"),
  entry("inv_bin_txn", "bin_txn_id", "inv", "bin_txn"),
  entry("inv_cycle_count", "cycle_count_id", "inv", "cycle_count", { state: "status" }),
  entry("inv_cycle_count_line", "cycle_count_line_id", "inv", "cycle_count_line"),
  entry("inv_lot", "lot_id", "inv", "lot", { label: ["lot_code"], search: ["lot_code", "lot_id"], state: "status" }),
  entry("inv_serial", "serial_id", "inv", "serial", { label: ["serial_number"], search: ["serial_number", "serial_id"], state: "status" }),

  // ── BOM (stored in inv_* tables) ───────────────────────────────────────────
  entry("inv_bom_header", "bom_id", "bom", "bom", { label: ["description"], search: ["description", "bom_id"], state: "status" }),
  entry("inv_bom_component", "component_id", "bom", "component", { label: ["component_description"], search: ["component_description", "component_id"] }),

  // ── PROJ ───────────────────────────────────────────────────────────────────
  entry("proj_project", "project_id", "proj", "project", { label: ["name"], search: ["name", "description", "project_id"], state: "status" }),
  entry("proj_wip", "wip_id", "proj", "wip", { state: "status", plural: "wip" }),
  entry("proj_bom_assignment", "assignment_id", "proj", "bom_assignment", { state: "status" }),
  entry("proj_labor_entry", "entry_id", "proj", "labor_entry", { plural: "labor_entries" }),
  entry("proj_labor_gl_posting", "entry_id", "proj", "labor_gl_posting"),
  entry("proj_finished_item", "finished_item_id", "proj", "finished_item"),
  entry("proj_project_change_request", "change_request_id", "proj", "project_change_request", { label: ["title"], search: ["title", "description", "change_request_id"], state: "status" }),
  entry("proj_project_milestone", "milestone_id", "proj", "project_milestone", { label: ["name"], search: ["name", "milestone_id"], state: "status" }),
  entry("proj_project_risk", "risk_id", "proj", "project_risk", { label: ["title"], search: ["title", "risk_id"] }),
  entry("proj_service_bom_requirement", "requirement_id", "proj", "service_bom_requirement", { state: "status" }),
  entry("proj_stage_gate", "gate_id", "proj", "stage_gate", { label: ["phase_name"], search: ["phase_name", "gate_id"] }),
  entry("proj_task", "task_id", "proj", "task", { label: ["name"], search: ["name", "description", "task_id"], state: "status" }),
  entry("proj_task_allocation", "allocation_id", "proj", "task_allocation", { state: "status" }),
  entry("proj_wbs_element", "wbs_element_id", "proj", "wbs_element", { label: ["name"], search: ["wbs_code", "name", "wbs_element_id"], state: "status" }),

  // ── TAX ────────────────────────────────────────────────────────────────────
  entry("tax_regime", "tax_regime_id", "tax", "regime", { label: ["name"], search: ["code", "name", "description", "tax_regime_id"] }),
  entry("tax_jurisdiction", "tax_jurisdiction_id", "tax", "jurisdiction", { label: ["name"], search: ["name", "country_code", "region_code", "city_code", "tax_jurisdiction_id"] }),
  entry("tax_code", "tax_code_id", "tax", "code", { label: ["code"], search: ["code", "description", "tax_code_id"] }),
  entry("tax_rate", "tax_rate_id", "tax", "rate"),
  entry("tax_rule", "tax_rule_id", "tax", "rule", { label: ["name"], search: ["code", "name", "description", "tax_rule_id"] }),
  entry("tax_account_mapping", "tax_account_mapping_id", "tax", "account_mapping", { label: ["transaction_type"] }),
  entry("tax_transaction_line", "tax_transaction_line_id", "tax", "transaction_line"),

  // ── ITR ────────────────────────────────────────────────────────────────────
  entry("itr_internal_trade", "trade_id", "itr", "internal_trade", { label: ["trade_number"], search: ["trade_number", "trade_type", "trade_id"], state: "status" }),
  entry("itr_internal_trade_line", "trade_line_id", "itr", "internal_trade_line", { label: ["description"] }),

  // ── System: events, navigation, ERP mapping metadata ───────────────────────
  entry("event", "event_id", "sys", "event", { label: ["event_type"], search: ["event_type", "entity_type", "entity_id", "event_id"] }),
  entry("replay_checkpoint", "checkpoint_name", "sys", "replay_checkpoint", { label: ["checkpoint_name"] }),
  entry("migration", "id", "sys", "migration", { label: ["id"] }),
  entry("governance_decision_log", "decision_id", "sys", "governance_decision_log", { label: ["entity_type"], search: ["entity_type", "decision_id"] }),
  entry("navlog", "navlog_id", "sys", "navlog", { label: ["entry_type"], search: ["entry_type", "entity_type", "navlog_id"] }),
  entry("transcript", "transcript_id", "sys", "transcript", { label: ["command_type"], search: ["command_type", "transcript_id"], state: "status" }),
  entry("repl_session", "session_id", "sys", "repl_session"),
  entry("erp_mapping", "mapping_id", "sys", "erp_mapping", { label: ["entity_name"], search: ["entity_name", "canonical_field", "mapping_id"] }),
  entry("erp_system", "system_id", "sys", "erp_system", { label: ["name"], search: ["name", "system_id"] }),
  entry("erp_canonical_entity", "entity_id", "sys", "erp_canonical_entity", { label: ["entity_name"], search: ["entity_name", "description", "entity_id"], plural: "erp_canonical_entities" }),
  entry("erp_canonical_field", "field_id", "sys", "erp_canonical_field", { label: ["canonical_field"], search: ["canonical_field", "description", "field_id"] }),
  entry("erp_field_mapping", "id", "sys", "erp_field_mapping", { label: ["erp_full_reference"], search: ["erp_full_reference", "id"] }),
  entry("erp_process", "process_id", "sys", "erp_process", { label: ["process_name"], search: ["process_name", "description", "process_id"] }),
  entry("erp_process_step", "step_id", "sys", "erp_process_step", { label: ["step_name"], search: ["step_name", "description", "step_id"] }),
  entry("erp_process_system_mapping", "id", "sys", "erp_process_system_mapping", { label: ["erp_process_name"], search: ["erp_process_name", "erp_transaction_code", "id"] }),
  entry("erp_system_field", "id", "sys", "erp_system_field", { label: ["erp_full_reference"], search: ["erp_full_reference", "id"] }),
  entry("v_cross_system_field_compare", "field_id", "sys", "v_cross_system_field_compare", { label: ["entity_name"], search: ["entity_name", "field_id"] }),
  entry("v_field_coverage", undefined, "sys", "v_field_coverage", { label: ["entity_name"], search: ["entity_name", "system_name", "erp_full_reference"] }),
  entry("v_system_gap_report", "domain", "sys", "v_system_gap_report", { label: ["system_name"], search: ["system_name", "domain"] }),
  entry("v_process_coverage", "process_id", "sys", "v_process_coverage", { label: ["process_name"], search: ["process_name", "system_name", "process_id"] }),
  entry("v_gap_fields_by_system", undefined, "sys", "v_gap_fields_by_system", { label: ["entity_name"], search: ["system_name", "entity_name", "canonical_field"] }),
  entry("v_system_specific_fields", undefined, "sys", "v_system_specific_fields", { label: ["erp_full_reference"], search: ["system_name", "erp_full_reference"] })
];

// Tables that exist in the database but must never be readable through this layer.
export const intentionallyExcluded: string[] = [];

const byTable = new Map(readModel.map((e) => [e.table, e]));

export function getReadModelEntry(table: string): ReadModelEntry | undefined {
  return byTable.get(table);
}

export function queryTablePrimaryKeys(): Record<string, string | undefined> {
  return Object.fromEntries(readModel.map((e) => [e.table, e.primaryKey]));
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
}

export function tableColumns(table: string): ColumnInfo[] {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; type: string; notnull: number }>;
  return rows.map((r) => ({ name: r.name, type: r.type, notNull: r.notnull === 1 }));
}

// Fails loudly when the whitelist references tables/columns the schema no longer has, or when the schema has unlisted tables.
export function validateReadModel(): string[] {
  const problems: string[] = [];
  const existing = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name)
  );

  for (const e of readModel) {
    if (!existing.has(e.table)) {
      problems.push(`${e.table}: table not found`);
      continue;
    }
    const cols = new Set(tableColumns(e.table).map((c) => c.name));
    const referenced = [
      ...(e.primaryKey && e.primaryKey !== "rowid" ? [e.primaryKey] : []),
      ...e.labelColumns,
      ...e.searchColumns,
      ...(e.stateColumn ? [e.stateColumn] : []),
      ...e.excludeColumns
    ];
    for (const col of referenced) {
      if (!cols.has(col)) problems.push(`${e.table}.${col}: column not found`);
    }
  }

  const listed = new Set(readModel.map((e) => e.table));
  for (const name of existing) {
    if (!listed.has(name) && !intentionallyExcluded.includes(name)) {
      problems.push(`${name}: exists in the database but is neither whitelisted nor intentionally excluded`);
    }
  }
  return problems;
}
