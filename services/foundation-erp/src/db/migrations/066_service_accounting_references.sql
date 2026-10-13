ALTER TABLE o2c_invoice ADD COLUMN accounting_journal_id TEXT REFERENCES r2r_journal(journal_id);
ALTER TABLE p2p_supplier_invoice ADD COLUMN accounting_journal_id TEXT REFERENCES r2r_journal(journal_id);
ALTER TABLE proj_project_milestone ADD COLUMN wip_release_journal_id TEXT REFERENCES r2r_journal(journal_id);
ALTER TABLE proj_project_milestone ADD COLUMN wip_released_amount REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_h2r_accrual_invoice_status
  ON h2r_contractor_accrual(supplier_invoice_id, status);