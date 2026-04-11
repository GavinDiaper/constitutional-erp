-- Add line-level tax metadata for O2C quote/order lines and explicit invoice totals.

ALTER TABLE o2c_quote_line ADD COLUMN tax_code_id TEXT;
ALTER TABLE o2c_quote_line ADD COLUMN tax_applicability TEXT;
ALTER TABLE o2c_quote_line ADD COLUMN tax_rate_percent REAL;
ALTER TABLE o2c_quote_line ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE o2c_sales_order_line ADD COLUMN tax_code_id TEXT;
ALTER TABLE o2c_sales_order_line ADD COLUMN tax_applicability TEXT;
ALTER TABLE o2c_sales_order_line ADD COLUMN tax_rate_percent REAL;
ALTER TABLE o2c_sales_order_line ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE o2c_invoice ADD COLUMN order_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE o2c_invoice ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE o2c_invoice ADD COLUMN total_payable REAL NOT NULL DEFAULT 0;