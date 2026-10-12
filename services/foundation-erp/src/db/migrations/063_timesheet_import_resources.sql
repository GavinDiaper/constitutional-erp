PRAGMA defer_foreign_keys = ON;

CREATE TABLE h2r_timesheet_next (
  timesheet_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  employee_id TEXT,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('employee', 'contractor')),
  resource_id TEXT NOT NULL,
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
  CHECK ((resource_type = 'employee' AND employee_id = resource_id) OR (resource_type = 'contractor' AND employee_id IS NULL)),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (employee_id) REFERENCES h2r_employee(employee_id)
);

INSERT INTO h2r_timesheet_next(
  timesheet_id, organization_id, employee_id, resource_type, resource_id,
  timesheet_period_start, timesheet_period_end, timesheet_period_year, timesheet_period_month,
  total_hours, total_cost, status, approval_status, submitted_by, submitted_at,
  approved_by, approved_at, rejection_reason, line_count, created_by, created_at, version, updated_at
)
SELECT timesheet_id, organization_id, employee_id, 'employee', employee_id,
       timesheet_period_start, timesheet_period_end, timesheet_period_year, timesheet_period_month,
       total_hours, total_cost, status, approval_status, submitted_by, submitted_at,
       approved_by, approved_at, rejection_reason, line_count, created_by, created_at, version, updated_at
FROM h2r_timesheet;

DROP TABLE h2r_timesheet;
ALTER TABLE h2r_timesheet_next RENAME TO h2r_timesheet;

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_employee ON h2r_timesheet(employee_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_org ON h2r_timesheet(organization_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_period ON h2r_timesheet(timesheet_period_start, timesheet_period_end);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_status ON h2r_timesheet(status);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_resource_period
  ON h2r_timesheet(organization_id, resource_type, resource_id, timesheet_period_start, timesheet_period_end);

CREATE TABLE IF NOT EXISTS h2r_employee_cost_rate (
  employee_cost_rate_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  cost_element_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  hourly_rate REAL NOT NULL CHECK (hourly_rate >= 0),
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (employee_id) REFERENCES h2r_employee(employee_id),
  FOREIGN KEY (cost_element_id) REFERENCES r2r_cost_element(cost_element_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_employee_cost_rate_lookup
  ON h2r_employee_cost_rate(organization_id, employee_id, cost_element_id, effective_from, effective_until);

CREATE TABLE IF NOT EXISTS h2r_timesheet_import_batch (
  import_batch_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Validated', 'Rejected', 'Committed')),
  row_count INTEGER NOT NULL,
  valid_row_count INTEGER NOT NULL,
  error_row_count INTEGER NOT NULL,
  normalized_rows_json TEXT NOT NULL,
  validation_errors_json TEXT NOT NULL,
  timesheet_ids_json TEXT NOT NULL DEFAULT '[]',
  imported_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  UNIQUE (organization_id, content_hash),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_import_batch_org
  ON h2r_timesheet_import_batch(organization_id, created_at);