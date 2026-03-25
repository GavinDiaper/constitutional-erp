CREATE TABLE IF NOT EXISTS p2p_supplier (
  supplier_id TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p2p_requisition (
  requisition_id TEXT PRIMARY KEY,
  requester TEXT NOT NULL,
  state TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p2p_requisition_line (
  requisition_line_id TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(requisition_id) REFERENCES p2p_requisition(requisition_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS p2p_purchase_order (
  po_id TEXT PRIMARY KEY,
  requisition_id TEXT,
  supplier_id TEXT NOT NULL,
  state TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(requisition_id) REFERENCES p2p_requisition(requisition_id),
  FOREIGN KEY(supplier_id) REFERENCES p2p_supplier(supplier_id)
);

CREATE TABLE IF NOT EXISTS p2p_purchase_order_line (
  po_line_id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(po_id) REFERENCES p2p_purchase_order(po_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS p2p_goods_receipt (
  receipt_id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  state TEXT NOT NULL,
  received_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(po_id) REFERENCES p2p_purchase_order(po_id)
);

CREATE TABLE IF NOT EXISTS p2p_supplier_invoice (
  supplier_invoice_id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  state TEXT NOT NULL,
  amount_due REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(po_id) REFERENCES p2p_purchase_order(po_id)
);

CREATE TABLE IF NOT EXISTS p2p_ap_payment (
  ap_payment_id TEXT PRIMARY KEY,
  supplier_invoice_id TEXT NOT NULL,
  state TEXT NOT NULL,
  amount REAL NOT NULL,
  executed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(supplier_invoice_id) REFERENCES p2p_supplier_invoice(supplier_invoice_id)
);
