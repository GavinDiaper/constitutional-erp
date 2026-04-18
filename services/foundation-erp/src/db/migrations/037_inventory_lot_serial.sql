-- Phase 2 optional inventory module: lot and serial tracking

CREATE TABLE IF NOT EXISTS inv_lot (
  lot_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  lot_code TEXT NOT NULL,
  manufacture_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  quantity_on_hand REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  UNIQUE(sku_id, organization_id, lot_code),
  CHECK(status IN ('Active', 'Hold', 'Consumed', 'Expired')),
  CHECK(quantity_on_hand >= 0)
);

CREATE TABLE IF NOT EXISTS inv_serial (
  serial_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  lot_id TEXT,
  serial_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY(lot_id) REFERENCES inv_lot(lot_id),
  UNIQUE(organization_id, serial_number),
  CHECK(status IN ('Available', 'Allocated', 'Consumed', 'Hold'))
);

CREATE INDEX IF NOT EXISTS idx_inv_lot_sku_org_status
ON inv_lot(sku_id, organization_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_inv_serial_sku_org_status
ON inv_serial(sku_id, organization_id, status, updated_at);
