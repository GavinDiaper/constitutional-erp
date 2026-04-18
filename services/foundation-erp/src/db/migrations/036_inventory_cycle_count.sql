-- Phase 2 operational inventory module: cycle counting

CREATE TABLE IF NOT EXISTS inv_cycle_count (
  cycle_count_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  bin_id TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  reason TEXT,
  scheduled_for TEXT,
  counted_at TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY(bin_id) REFERENCES inv_bin(bin_id),
  CHECK(status IN ('Open', 'Counted', 'Posted', 'Cancelled'))
);

CREATE TABLE IF NOT EXISTS inv_cycle_count_line (
  cycle_count_line_id TEXT PRIMARY KEY,
  cycle_count_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  expected_quantity REAL NOT NULL,
  counted_quantity REAL NOT NULL,
  variance_quantity REAL NOT NULL,
  reason TEXT,
  counted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(cycle_count_id) REFERENCES inv_cycle_count(cycle_count_id),
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  UNIQUE(cycle_count_id, sku_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_cycle_count_org_status
ON inv_cycle_count(organization_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_inv_cycle_count_line_count
ON inv_cycle_count_line(cycle_count_id, sku_id);
