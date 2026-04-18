-- Phase 2 operational inventory module: reservations

CREATE TABLE IF NOT EXISTS inv_reservation (
  reservation_id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  reservation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  quantity REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  correlation_key TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  released_at TEXT,
  released_reason TEXT,
  FOREIGN KEY(sku_id) REFERENCES inv_sku(sku_id),
  FOREIGN KEY(organization_id) REFERENCES inv_organization(organization_id),
  UNIQUE(correlation_key),
  CHECK(reservation_type IN ('soft', 'hard')),
  CHECK(status IN ('Active', 'Released', 'Fulfilled', 'Cancelled')),
  CHECK(quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_inv_reservation_sku_org_status
ON inv_reservation(sku_id, organization_id, status, reservation_type, created_at);

CREATE INDEX IF NOT EXISTS idx_inv_reservation_reference
ON inv_reservation(reference_type, reference_id);
