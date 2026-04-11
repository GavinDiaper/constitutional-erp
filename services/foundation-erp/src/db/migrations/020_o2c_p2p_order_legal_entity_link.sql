-- Direct legal entity linkage for commercial orders
ALTER TABLE o2c_sales_order ADD COLUMN legal_entity_id TEXT NOT NULL DEFAULT 'LE-SEED-DEFAULT';
ALTER TABLE p2p_purchase_order ADD COLUMN legal_entity_id TEXT NOT NULL DEFAULT 'LE-SEED-DEFAULT';

CREATE INDEX IF NOT EXISTS idx_o2c_sales_order_legal_entity ON o2c_sales_order(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_p2p_purchase_order_legal_entity ON p2p_purchase_order(legal_entity_id);
