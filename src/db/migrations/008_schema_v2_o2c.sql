-- v2: O2C canonical field additions and Shipment entity

-- Customer: billing and shipping addresses
ALTER TABLE o2c_customer ADD COLUMN billing_address TEXT;
ALTER TABLE o2c_customer ADD COLUMN shipping_address TEXT;

-- ARInvoice: currency, dates
ALTER TABLE o2c_invoice ADD COLUMN currency_code TEXT;
ALTER TABLE o2c_invoice ADD COLUMN invoice_date TEXT;
ALTER TABLE o2c_invoice ADD COLUMN due_date TEXT;

-- ARPayment: currency, payment date, method
ALTER TABLE o2c_payment ADD COLUMN currency_code TEXT;
ALTER TABLE o2c_payment ADD COLUMN payment_date TEXT;
ALTER TABLE o2c_payment ADD COLUMN method TEXT;

-- Shipment entity (new in v2)
CREATE TABLE IF NOT EXISTS o2c_shipment (
  shipment_id   TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  state         TEXT NOT NULL,
  ship_date     TEXT,
  carrier       TEXT,
  tracking_number TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES o2c_sales_order(order_id),
  CHECK(state IN ('Planned', 'Shipped', 'Delivered', 'Cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_o2c_shipment_order ON o2c_shipment(order_id);
