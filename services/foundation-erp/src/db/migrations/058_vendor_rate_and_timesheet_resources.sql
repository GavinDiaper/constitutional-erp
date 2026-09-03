-- Migration 058: Vendor-rate support and contractor-aware timesheet lines

CREATE TABLE IF NOT EXISTS h2r_vendor_rate (
  vendor_rate_id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  role TEXT NOT NULL,
  hourly_rate REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_h2r_vendor_rate_contractor ON h2r_vendor_rate(contractor_id);
CREATE INDEX IF NOT EXISTS idx_h2r_vendor_rate_vendor ON h2r_vendor_rate(vendor_name);
CREATE INDEX IF NOT EXISTS idx_h2r_vendor_rate_effective ON h2r_vendor_rate(effective_from, effective_until);

-- The base H2R schema already contains h2r_timesheet_line.updated_at and task_id,
-- so only add the missing contractor-specific fields required by the timesheet API.
ALTER TABLE h2r_timesheet_line ADD COLUMN resource_id TEXT;
ALTER TABLE h2r_timesheet_line ADD COLUMN resource_type TEXT CHECK (resource_type IN ('employee', 'contractor'));
ALTER TABLE h2r_timesheet_line ADD COLUMN vendor_rate_id TEXT;

UPDATE h2r_timesheet_line
SET resource_type = 'employee'
WHERE resource_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_resource ON h2r_timesheet_line(resource_id);
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_vendor_rate ON h2r_timesheet_line(vendor_rate_id);
