PRAGMA foreign_keys = OFF;

ALTER TABLE h2r_timesheet_line RENAME TO h2r_timesheet_line_old;
ALTER TABLE h2r_timesheet RENAME TO h2r_timesheet_old;

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
  FOREIGN KEY (employee_id) REFERENCES h2r_employee(employee_id)
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

INSERT INTO h2r_timesheet (
  timesheet_id, organization_id, employee_id, timesheet_period_start, timesheet_period_end,
  timesheet_period_year, timesheet_period_month, total_hours, total_cost, status, approval_status,
  submitted_by, submitted_at, approved_by, approved_at, rejection_reason, line_count, created_by,
  created_at, version, updated_at
)
SELECT
  timesheet_id, organization_id, employee_id, timesheet_period_start, timesheet_period_end,
  timesheet_period_year, timesheet_period_month, total_hours, total_cost, status, approval_status,
  submitted_by, submitted_at, approved_by, approved_at, rejection_reason, line_count, created_by,
  created_at, version, updated_at
FROM h2r_timesheet_old;

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

DROP TABLE h2r_timesheet_line_old;
DROP TABLE h2r_timesheet_old;

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_employee ON h2r_timesheet(employee_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_org ON h2r_timesheet(organization_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_period ON h2r_timesheet(timesheet_period_start, timesheet_period_end);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_status ON h2r_timesheet(status);

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_timesheet ON h2r_timesheet_line(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_project ON h2r_timesheet_line(project_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_cost_element ON h2r_timesheet_line(cost_element_id);

PRAGMA foreign_keys = ON;
