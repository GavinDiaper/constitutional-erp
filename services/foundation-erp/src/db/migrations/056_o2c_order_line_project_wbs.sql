ALTER TABLE o2c_sales_order_line ADD COLUMN project_id TEXT;
ALTER TABLE o2c_sales_order_line ADD COLUMN wbs_id TEXT;

CREATE INDEX IF NOT EXISTS idx_o2c_sales_order_line_project ON o2c_sales_order_line(project_id, order_id);
CREATE INDEX IF NOT EXISTS idx_o2c_sales_order_line_wbs ON o2c_sales_order_line(wbs_id, order_id);
