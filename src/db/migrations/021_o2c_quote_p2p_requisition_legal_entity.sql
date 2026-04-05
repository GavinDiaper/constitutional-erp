-- Legal entity linkage on source documents (quotes and requisitions)
-- Allows order/PO to inherit legal entity at conversion time
ALTER TABLE o2c_quote ADD COLUMN legal_entity_id TEXT;
ALTER TABLE p2p_requisition ADD COLUMN legal_entity_id TEXT;

CREATE INDEX IF NOT EXISTS idx_o2c_quote_legal_entity ON o2c_quote(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_p2p_requisition_legal_entity ON p2p_requisition(legal_entity_id);
