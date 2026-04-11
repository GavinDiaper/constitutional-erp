-- Add line-level tax metadata for P2P requisition and PO lines.

ALTER TABLE p2p_requisition_line ADD COLUMN tax_code_id TEXT;
ALTER TABLE p2p_requisition_line ADD COLUMN tax_applicability TEXT;
ALTER TABLE p2p_requisition_line ADD COLUMN tax_rate_percent REAL;
ALTER TABLE p2p_requisition_line ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE p2p_purchase_order_line ADD COLUMN tax_code_id TEXT;
ALTER TABLE p2p_purchase_order_line ADD COLUMN tax_applicability TEXT;
ALTER TABLE p2p_purchase_order_line ADD COLUMN tax_rate_percent REAL;
ALTER TABLE p2p_purchase_order_line ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;
