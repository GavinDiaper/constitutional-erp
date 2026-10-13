CREATE TABLE IF NOT EXISTS r2r_journal_reversal (
  original_journal_id TEXT PRIMARY KEY REFERENCES r2r_journal(journal_id),
  reversal_journal_id TEXT NOT NULL UNIQUE REFERENCES r2r_journal(journal_id),
  created_at TEXT NOT NULL
);

ALTER TABLE o2c_invoice ADD COLUMN reversal_journal_id TEXT REFERENCES r2r_journal(journal_id);
ALTER TABLE p2p_supplier_invoice ADD COLUMN reversal_journal_id TEXT REFERENCES r2r_journal(journal_id);

ALTER TABLE p2p_supplier_invoice_timesheet_accrual
  RENAME TO p2p_supplier_invoice_timesheet_accrual_legacy;

CREATE TABLE p2p_supplier_invoice_timesheet_accrual (
  supplier_invoice_id TEXT NOT NULL REFERENCES p2p_supplier_invoice(supplier_invoice_id),
  accrual_id TEXT NOT NULL REFERENCES h2r_contractor_accrual(accrual_id),
  matched_amount REAL NOT NULL CHECK (matched_amount > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (supplier_invoice_id, accrual_id)
);

INSERT INTO p2p_supplier_invoice_timesheet_accrual(supplier_invoice_id, accrual_id, matched_amount, created_at)
SELECT supplier_invoice_id, accrual_id, matched_amount, created_at
FROM p2p_supplier_invoice_timesheet_accrual_legacy;

DROP TABLE p2p_supplier_invoice_timesheet_accrual_legacy;

CREATE INDEX IF NOT EXISTS idx_p2p_invoice_timesheet_accrual_invoice
  ON p2p_supplier_invoice_timesheet_accrual(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_p2p_invoice_timesheet_accrual_accrual
  ON p2p_supplier_invoice_timesheet_accrual(accrual_id);
