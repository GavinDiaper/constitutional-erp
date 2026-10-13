ALTER TABLE h2r_vendor_rate ADD COLUMN supplier_id TEXT REFERENCES p2p_supplier(supplier_id);
ALTER TABLE proj_project_milestone ADD COLUMN revenue_journal_id TEXT REFERENCES r2r_journal(journal_id);

CREATE TABLE IF NOT EXISTS proj_labor_gl_posting (
  entry_id TEXT PRIMARY KEY REFERENCES proj_labor_entry(entry_id),
  journal_id TEXT NOT NULL UNIQUE REFERENCES r2r_journal(journal_id),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('employee', 'contractor')),
  amount REAL NOT NULL CHECK (amount >= 0),
  posted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS h2r_contractor_accrual (
  accrual_id TEXT PRIMARY KEY,
  timesheet_line_id TEXT NOT NULL UNIQUE REFERENCES h2r_timesheet_line(timesheet_line_id),
  labor_entry_id TEXT NOT NULL UNIQUE REFERENCES proj_labor_entry(entry_id),
  contractor_id TEXT NOT NULL,
  vendor_rate_id TEXT NOT NULL REFERENCES h2r_vendor_rate(vendor_rate_id),
  supplier_id TEXT REFERENCES p2p_supplier(supplier_id),
  project_id TEXT NOT NULL REFERENCES proj_project(project_id),
  currency TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'Accrued' CHECK (status IN ('Accrued', 'Invoiced', 'Paid')),
  gl_journal_id TEXT NOT NULL REFERENCES r2r_journal(journal_id),
  supplier_invoice_id TEXT REFERENCES p2p_supplier_invoice(supplier_invoice_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_h2r_contractor_accrual_supplier_status
  ON h2r_contractor_accrual(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_h2r_contractor_accrual_project
  ON h2r_contractor_accrual(project_id, status);

CREATE TABLE IF NOT EXISTS p2p_supplier_invoice_timesheet_accrual (
  supplier_invoice_id TEXT NOT NULL REFERENCES p2p_supplier_invoice(supplier_invoice_id),
  accrual_id TEXT NOT NULL UNIQUE REFERENCES h2r_contractor_accrual(accrual_id),
  matched_amount REAL NOT NULL CHECK (matched_amount >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (supplier_invoice_id, accrual_id)
);

CREATE INDEX IF NOT EXISTS idx_p2p_invoice_timesheet_accrual_invoice
  ON p2p_supplier_invoice_timesheet_accrual(supplier_invoice_id);