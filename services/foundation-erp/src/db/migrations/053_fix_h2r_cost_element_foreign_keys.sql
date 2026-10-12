PRAGMA foreign_keys = OFF;

ALTER TABLE h2r_labor_rate_card RENAME TO h2r_labor_rate_card_old;
ALTER TABLE h2r_timesheet_line RENAME TO h2r_timesheet_line_old;

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
  FOREIGN KEY (employee_id) REFERENCES h2r_employee(employee_id),
  FOREIGN KEY (cost_element_id) REFERENCES r2r_cost_element(cost_element_id)
);

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

INSERT INTO h2r_labor_rate_card (
  rate_card_id, organization_id, employee_id, rate_card_type, cost_element_id,
  currency, base_rate, effective_from, effective_until, approval_status,
  approved_by, approved_at, created_by, created_at, version, updated_at
)
SELECT
  rate_card_id, organization_id, employee_id, rate_card_type, cost_element_id,
  currency, base_rate, effective_from, effective_until, approval_status,
  approved_by, approved_at, created_by, created_at, version, updated_at
FROM h2r_labor_rate_card_old;

INSERT INTO h2r_timesheet_line (
  timesheet_line_id, timesheet_id, line_number, project_id, cost_element_id, work_date,
  hours, quantity_uom, labor_rate_from, hourly_rate, line_cost, description,
  created_by, created_at, version, updated_at
)
SELECT
  timesheet_line_id, timesheet_id, line_number, project_id, cost_element_id, work_date,
  hours, quantity_uom, labor_rate_from, hourly_rate, line_cost, description,
  created_by, created_at, version, updated_at
FROM h2r_timesheet_line_old;

DROP TABLE h2r_labor_rate_card_old;
DROP TABLE h2r_timesheet_line_old;

CREATE INDEX IF NOT EXISTS idx_h2r_labor_rate_card_employee ON h2r_labor_rate_card(employee_id);
CREATE INDEX IF NOT EXISTS idx_h2r_labor_rate_card_org ON h2r_labor_rate_card(organization_id);
CREATE INDEX IF NOT EXISTS idx_h2r_labor_rate_card_effective ON h2r_labor_rate_card(effective_from, effective_until);

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_timesheet ON h2r_timesheet_line(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_project ON h2r_timesheet_line(project_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_cost_element ON h2r_timesheet_line(cost_element_id);

PRAGMA foreign_keys = ON;
