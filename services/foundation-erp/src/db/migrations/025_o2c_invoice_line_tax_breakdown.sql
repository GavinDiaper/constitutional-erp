CREATE TABLE IF NOT EXISTS o2c_invoice_line (
  invoice_line_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  order_line_id TEXT,
  sku TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  tax_code_id TEXT,
  tax_applicability TEXT,
  tax_rate_percent REAL,
  tax_amount REAL NOT NULL DEFAULT 0,
  line_payable REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES o2c_invoice(invoice_id) ON DELETE CASCADE,
  FOREIGN KEY(order_line_id) REFERENCES o2c_sales_order_line(order_line_id)
);

CREATE INDEX IF NOT EXISTS idx_o2c_invoice_line_invoice
ON o2c_invoice_line(invoice_id);