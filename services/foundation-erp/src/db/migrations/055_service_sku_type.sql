ALTER TABLE inv_sku ADD COLUMN sku_type TEXT NOT NULL DEFAULT 'physical' CHECK(sku_type IN ('physical', 'service'));

UPDATE inv_sku SET sku_type = 'physical' WHERE sku_type IS NULL OR sku_type = '';
