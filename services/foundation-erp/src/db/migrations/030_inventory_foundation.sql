-- Inventory constitutional foundation (MVP phase 0/1)

CREATE TABLE IF NOT EXISTS inv_sku (
  sku_id TEXT PRIMARY KEY,
  sku_code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT,
  uom TEXT NOT NULL,
  valuation_method TEXT NOT NULL,
  standard_cost REAL NOT NULL DEFAULT 0,
  lifecycle_state TEXT NOT NULL DEFAULT 'Active',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(valuation_method IN ('standard', 'moving_average')),
  CHECK(lifecycle_state IN ('Draft', 'Active', 'Inactive', 'Retired')),
  CHECK(standard_cost >= 0)
);

CREATE TABLE IF NOT EXISTS inv_organization (
  organization_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ledger_id TEXT,
  inventory_asset_account_code TEXT NOT NULL DEFAULT 'SYS-120-ASSET-INVENTORY',
  cogs_account_code TEXT NOT NULL DEFAULT 'SYS-500-EXP-COGS',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(ledger_id) REFERENCES r2r_ledger(ledger_id)
);

CREATE TABLE IF NOT EXISTS inv_on_hand (
  on_hand_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  quantity_on_hand REAL NOT NULL DEFAULT 0,
  inventory_value REAL NOT NULL DEFAULT 0,
  moving_average_cost REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  UNIQUE(sku_id, organization_id)
);

CREATE TABLE IF NOT EXISTS inv_movement (
  movement_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  correlation_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  UNIQUE(correlation_key),
  CHECK(movement_type IN ('receipt', 'issue', 'adjustment', 'cost_update')),
  CHECK(unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inv_on_hand_sku_org
ON inv_on_hand(sku_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_inv_movement_sku_org
ON inv_movement(sku_id, organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_inv_movement_reference
ON inv_movement(reference_type, reference_id);
