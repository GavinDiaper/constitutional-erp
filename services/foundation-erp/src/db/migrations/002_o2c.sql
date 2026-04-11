CREATE TABLE IF NOT EXISTS o2c_customer (
  customer_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS o2c_quote (
  quote_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  state TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES o2c_customer(customer_id)
);

CREATE TABLE IF NOT EXISTS o2c_quote_line (
  quote_line_id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(quote_id) REFERENCES o2c_quote(quote_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS o2c_sales_order (
  order_id TEXT PRIMARY KEY,
  quote_id TEXT,
  customer_id TEXT NOT NULL,
  state TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(quote_id) REFERENCES o2c_quote(quote_id),
  FOREIGN KEY(customer_id) REFERENCES o2c_customer(customer_id)
);

CREATE TABLE IF NOT EXISTS o2c_sales_order_line (
  order_line_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES o2c_sales_order(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS o2c_invoice (
  invoice_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  state TEXT NOT NULL,
  amount_due REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES o2c_sales_order(order_id)
);

CREATE TABLE IF NOT EXISTS o2c_payment (
  payment_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  state TEXT NOT NULL,
  amount REAL NOT NULL,
  received_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES o2c_invoice(invoice_id)
);
