ALTER TABLE proj_project_milestone ADD COLUMN contract_version_id TEXT REFERENCES o2c_contract_version(contract_version_id);
ALTER TABLE proj_project_milestone ADD COLUMN order_line_id TEXT REFERENCES o2c_sales_order_line(order_line_id);
ALTER TABLE proj_project_milestone ADD COLUMN wbs_element_id TEXT REFERENCES proj_wbs_element(wbs_element_id);
ALTER TABLE proj_project_milestone ADD COLUMN invoice_id TEXT REFERENCES o2c_invoice(invoice_id);
ALTER TABLE proj_project_milestone ADD COLUMN billed_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE o2c_invoice ADD COLUMN project_milestone_id TEXT REFERENCES proj_project_milestone(milestone_id);
ALTER TABLE o2c_sales_order ADD COLUMN billing_state TEXT NOT NULL DEFAULT 'Unbilled'
  CHECK (billing_state IN ('Unbilled', 'PartiallyInvoiced', 'Invoiced'));

UPDATE o2c_sales_order
SET billing_state = 'Invoiced'
WHERE state IN ('Invoiced', 'Paid', 'Closed');

CREATE INDEX IF NOT EXISTS idx_proj_milestone_order_line ON proj_project_milestone(order_line_id);
CREATE INDEX IF NOT EXISTS idx_proj_milestone_wbs_element ON proj_project_milestone(wbs_element_id);
CREATE INDEX IF NOT EXISTS idx_o2c_invoice_project_milestone ON o2c_invoice(project_milestone_id);