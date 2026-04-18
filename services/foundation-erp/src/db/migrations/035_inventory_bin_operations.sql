-- Phase 2 operational inventory module: bin/location operations

CREATE TABLE IF NOT EXISTS inv_bin (
  bin_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  bin_code TEXT NOT NULL,
  zone TEXT,
  aisle TEXT,
  rack TEXT,
  shelf_level TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  UNIQUE(organization_id, bin_code),
  CHECK(is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS inv_bin_balance (
  bin_balance_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY(bin_id) REFERENCES inv_bin(bin_id),
  UNIQUE(sku_id, organization_id, bin_id),
  CHECK(quantity >= 0)
);

CREATE TABLE IF NOT EXISTS inv_bin_txn (
  bin_txn_id TEXT PRIMARY KEY,
  txn_type TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  correlation_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY(bin_id) REFERENCES inv_bin(bin_id),
  UNIQUE(correlation_key),
  CHECK(txn_type IN ('putaway', 'pick', 'adjustment'))
);

CREATE INDEX IF NOT EXISTS idx_inv_bin_org_code
ON inv_bin(organization_id, bin_code);

CREATE INDEX IF NOT EXISTS idx_inv_bin_balance_sku_org
ON inv_bin_balance(sku_id, organization_id, bin_id);

CREATE INDEX IF NOT EXISTS idx_inv_bin_txn_bin_created
ON inv_bin_txn(bin_id, created_at);
