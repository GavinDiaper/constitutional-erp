-- Phase 1 Database Migration: Projects, BOM, H2R Labor Cost Schema
-- 
-- Creates all necessary tables for:
-- - Project aggregate and Project WIP ledger
-- - BOM Header and Components
-- - Cost Element Master
-- - H2R Labor Rate Card and Timesheet
-- - Internal Trade (PO/SO)

-- ============================================================================
-- PROJECT SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS proj_project (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  customer_id TEXT,
  contract_id TEXT,
  project_type TEXT NOT NULL CHECK (project_type IN ('Internal', 'Capital', 'Billable', 'Service')),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'OnHold', 'Completed', 'Cancelled')),
  budget_amount REAL NOT NULL DEFAULT 0,
  actual_cost_amount REAL NOT NULL DEFAULT 0,
  revenue_amount REAL,
  default_wip_account_id TEXT NOT NULL,
  default_close_account_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  project_manager_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  last_event_at TEXT NOT NULL,
  wip_material_balance REAL NOT NULL DEFAULT 0,
  wip_labor_balance REAL NOT NULL DEFAULT 0,
  wip_total_balance REAL NOT NULL DEFAULT 0,
  closed_fg_cost REAL,
  closed_expense_cost REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_project_status ON proj_project(status);
CREATE INDEX IF NOT EXISTS idx_proj_project_org ON proj_project(organization_id);
CREATE INDEX IF NOT EXISTS idx_proj_project_customer ON proj_project(customer_id);
CREATE INDEX IF NOT EXISTS idx_proj_project_created_at ON proj_project(created_at);

-- proj_wip: Project WIP accumulation ledger
CREATE TABLE IF NOT EXISTS proj_wip (
  wip_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  wip_material_balance REAL NOT NULL DEFAULT 0,
  wip_labor_balance REAL NOT NULL DEFAULT 0,
  wip_overhead_balance REAL NOT NULL DEFAULT 0,
  wip_total_balance REAL NOT NULL DEFAULT 0,
  material_line_count INTEGER NOT NULL DEFAULT 0,
  labor_line_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  closed_at TEXT,
  close_completion_type TEXT CHECK (close_completion_type IN ('FG_Conversion', 'Expense_Close')),
  organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_material_posted_at TEXT,
  last_labor_posted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_wip_project ON proj_wip(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_wip_status ON proj_wip(status);
CREATE INDEX IF NOT EXISTS idx_proj_wip_org ON proj_wip(organization_id);

-- ============================================================================
-- BOM (BILL OF MATERIALS) SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS inv_bom_header (
  bom_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Inactive')),
  project_eligible BOOLEAN NOT NULL DEFAULT 0,
  costing_profile TEXT NOT NULL DEFAULT 'Standard' CHECK (costing_profile IN ('Standard', 'Average', 'FIFO', 'LIFO')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  effective_date TEXT,
  end_date TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sku_id, organization_id, revision),
  FOREIGN KEY (sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_bom_header_sku ON inv_bom_header(sku_id);
CREATE INDEX IF NOT EXISTS idx_inv_bom_header_org ON inv_bom_header(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_bom_header_status ON inv_bom_header(status);
CREATE INDEX IF NOT EXISTS idx_inv_bom_header_project_eligible ON inv_bom_header(project_eligible);

CREATE TABLE IF NOT EXISTS inv_bom_component (
  component_id TEXT PRIMARY KEY,
  bom_id TEXT NOT NULL,
  component_sku_id TEXT,
  component_line_number INTEGER NOT NULL,
  component_description TEXT,
  component_type TEXT NOT NULL CHECK (component_type IN ('Material', 'LaborCostElement', 'OtherCostElement')),
  quantity REAL NOT NULL,
  quantity_uom TEXT NOT NULL,
  scrap_percentage REAL NOT NULL DEFAULT 0,
  is_phantom BOOLEAN NOT NULL DEFAULT 0,
  standard_cost REAL NOT NULL DEFAULT 0,
  cost_element_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bom_id) REFERENCES inv_bom_header(bom_id),
  FOREIGN KEY (component_sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY (cost_element_id) REFERENCES r2r_cost_element(cost_element_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_bom_component_bom ON inv_bom_component(bom_id);
CREATE INDEX IF NOT EXISTS idx_inv_bom_component_sku ON inv_bom_component(component_sku_id);
CREATE INDEX IF NOT EXISTS idx_inv_bom_component_cost_element ON inv_bom_component(cost_element_id);

-- ============================================================================
-- COST ELEMENT SCHEMA (R2R / GL Routing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS r2r_cost_element (
  cost_element_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  cost_element_name TEXT NOT NULL,
  cost_element_type TEXT NOT NULL CHECK (cost_element_type IN ('Material', 'Labor', 'Overhead', 'Other')),
  cost_category TEXT NOT NULL DEFAULT 'Standard',
  gl_account_id TEXT NOT NULL,
  tax_code_id TEXT,
  allocation_method TEXT NOT NULL DEFAULT 'Direct' CHECK (allocation_method IN ('Direct', 'Allocation', 'Rounding')),
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, cost_element_name),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (gl_account_id) REFERENCES r2r_chart_of_accounts(account_id)
);

CREATE INDEX IF NOT EXISTS idx_r2r_cost_element_org ON r2r_cost_element(organization_id);
CREATE INDEX IF NOT EXISTS idx_r2r_cost_element_type ON r2r_cost_element(cost_element_type);
CREATE INDEX IF NOT EXISTS idx_r2r_cost_element_active ON r2r_cost_element(is_active);

-- ============================================================================
-- H2R LABOR COST SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS h2r_labor_rate_card (
  rate_card_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  rate_card_type TEXT NOT NULL CHECK (rate_card_type IN ('Hourly', 'Daily', 'Contract')),
  cost_element_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  base_rate REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  approval_status TEXT NOT NULL DEFAULT 'Draft' CHECK (approval_status IN ('Draft', 'Pending', 'Approved', 'Rejected')),
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (employee_id) REFERENCES h2r_employee_master(employee_id),
  FOREIGN KEY (cost_element_id) REFERENCES r2r_cost_element(cost_element_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_labor_rate_card_employee ON h2r_labor_rate_card(employee_id);
CREATE INDEX IF NOT EXISTS idx_h2r_labor_rate_card_org ON h2r_labor_rate_card(organization_id);
CREATE INDEX IF NOT EXISTS idx_h2r_labor_rate_card_effective ON h2r_labor_rate_card(effective_from, effective_until);

CREATE TABLE IF NOT EXISTS h2r_timesheet (
  timesheet_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  timesheet_period_start TEXT NOT NULL,
  timesheet_period_end TEXT NOT NULL,
  timesheet_period_year INTEGER NOT NULL,
  timesheet_period_month INTEGER NOT NULL,
  total_hours REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Posted')),
  approval_status TEXT NOT NULL DEFAULT 'Pending' CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  line_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (employee_id) REFERENCES h2r_employee_master(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_employee ON h2r_timesheet(employee_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_org ON h2r_timesheet(organization_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_period ON h2r_timesheet(timesheet_period_start, timesheet_period_end);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_status ON h2r_timesheet(status);

CREATE TABLE IF NOT EXISTS h2r_timesheet_line (
  timesheet_line_id TEXT PRIMARY KEY,
  timesheet_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  project_id TEXT,
  cost_element_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  hours REAL NOT NULL,
  quantity_uom TEXT NOT NULL DEFAULT 'Hour',
  labor_rate_from TEXT NOT NULL CHECK (labor_rate_from IN ('EmployeeOverride', 'RoleDefault', 'LookupCard')),
  hourly_rate REAL NOT NULL,
  line_cost REAL NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (timesheet_id) REFERENCES h2r_timesheet(timesheet_id),
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id),
  FOREIGN KEY (cost_element_id) REFERENCES r2r_cost_element(cost_element_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_timesheet ON h2r_timesheet_line(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_project ON h2r_timesheet_line(project_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_cost_element ON h2r_timesheet_line(cost_element_id);

-- ============================================================================
-- INTERNAL TRADE SCHEMA (Internal PO/SO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS itr_internal_trade (
  trade_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('InternalPO', 'InternalSO')),
  trade_number TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  from_department TEXT NOT NULL,
  to_department TEXT NOT NULL,
  from_cost_center TEXT,
  to_cost_center TEXT,
  project_id TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  total_line_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Released', 'Fulfilled', 'Closed')),
  approval_status TEXT NOT NULL DEFAULT 'Pending' CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
  approved_by TEXT,
  approved_at TEXT,
  transfer_pricing_method TEXT NOT NULL DEFAULT 'StandardCost' CHECK (transfer_pricing_method IN ('StandardCost', 'ActualCost', 'MarkupPercentage')),
  transfer_pricing_value REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, trade_number),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id)
);

CREATE INDEX IF NOT EXISTS idx_itr_internal_trade_org ON itr_internal_trade(organization_id);
CREATE INDEX IF NOT EXISTS idx_itr_internal_trade_type ON itr_internal_trade(trade_type);
CREATE INDEX IF NOT EXISTS idx_itr_internal_trade_project ON itr_internal_trade(project_id);
CREATE INDEX IF NOT EXISTS idx_itr_internal_trade_status ON itr_internal_trade(status);

CREATE TABLE IF NOT EXISTS itr_internal_trade_line (
  trade_line_id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  sku_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  quantity_uom TEXT NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  cost_element_id TEXT,
  description TEXT,
  scrap_quantity REAL DEFAULT 0,
  scrap_percentage REAL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trade_id) REFERENCES itr_internal_trade(trade_id),
  FOREIGN KEY (sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY (cost_element_id) REFERENCES r2r_cost_element(cost_element_id)
);

CREATE INDEX IF NOT EXISTS idx_itr_internal_trade_line_trade ON itr_internal_trade_line(trade_id);
CREATE INDEX IF NOT EXISTS idx_itr_internal_trade_line_sku ON itr_internal_trade_line(sku_id);
