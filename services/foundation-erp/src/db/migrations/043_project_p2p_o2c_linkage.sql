ALTER TABLE p2p_requisition ADD COLUMN project_id TEXT;
ALTER TABLE p2p_requisition ADD COLUMN wbs_id TEXT;

ALTER TABLE p2p_purchase_order ADD COLUMN project_id TEXT;
ALTER TABLE p2p_purchase_order ADD COLUMN wbs_id TEXT;

ALTER TABLE o2c_sales_order ADD COLUMN project_id TEXT;
ALTER TABLE o2c_sales_order ADD COLUMN wbs_id TEXT;

CREATE INDEX IF NOT EXISTS idx_p2p_requisition_project ON p2p_requisition(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_p2p_purchase_order_project ON p2p_purchase_order(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_o2c_sales_order_project ON o2c_sales_order(project_id, created_at);