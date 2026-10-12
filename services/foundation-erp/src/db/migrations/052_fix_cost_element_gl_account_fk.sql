PRAGMA foreign_keys = OFF;

ALTER TABLE r2r_cost_element RENAME TO r2r_cost_element_old;

CREATE TABLE IF NOT EXISTS r2r_cost_element (
  cost_element_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  cost_element_name TEXT NOT NULL,
  cost_element_type TEXT NOT NULL CHECK (cost_element_type IN ('Material', 'Labor', 'Overhead', 'Other')),
  cost_category TEXT NOT NULL DEFAULT 'Standard',
  gl_account_id TEXT NOT NULL,
  tax_code_id TEXT,
  allocation_method TEXT NOT NULL DEFAULT 'Direct' CHECK (allocation_method IN ('Direct', 'Allocation', 'Rounding')),
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, cost_element_name),
  FOREIGN KEY (organization_id) REFERENCES inv_organization(organization_id),
  FOREIGN KEY (gl_account_id) REFERENCES r2r_account(account_id)
);

INSERT INTO r2r_cost_element (
  cost_element_id, organization_id, cost_element_name, cost_element_type, cost_category,
  gl_account_id, tax_code_id, allocation_method, is_active, created_by, created_at, version, updated_at
)
SELECT
  cost_element_id, organization_id, cost_element_name, cost_element_type, cost_category,
  gl_account_id, tax_code_id, allocation_method, is_active, created_by, created_at, version, updated_at
FROM r2r_cost_element_old;

DROP TABLE r2r_cost_element_old;

CREATE INDEX IF NOT EXISTS idx_r2r_cost_element_org ON r2r_cost_element(organization_id);
CREATE INDEX IF NOT EXISTS idx_r2r_cost_element_type ON r2r_cost_element(cost_element_type);
CREATE INDEX IF NOT EXISTS idx_r2r_cost_element_active ON r2r_cost_element(is_active);

PRAGMA foreign_keys = ON;
