CREATE TABLE IF NOT EXISTS proj_wbs_element (
  wbs_element_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  contract_version_id TEXT,
  parent_wbs_element_id TEXT,
  wbs_code TEXT NOT NULL,
  name TEXT NOT NULL,
  phase_name TEXT,
  deliverable_sku_id TEXT,
  status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'Active', 'Completed', 'Cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, wbs_code),
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id),
  FOREIGN KEY (contract_version_id) REFERENCES o2c_contract_version(contract_version_id),
  FOREIGN KEY (parent_wbs_element_id) REFERENCES proj_wbs_element(wbs_element_id),
  FOREIGN KEY (deliverable_sku_id) REFERENCES inv_sku(sku_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_wbs_element_project ON proj_wbs_element(project_id, parent_wbs_element_id);
CREATE INDEX IF NOT EXISTS idx_proj_wbs_element_contract ON proj_wbs_element(contract_version_id);

INSERT OR IGNORE INTO proj_wbs_element(
  wbs_element_id, project_id, contract_version_id, parent_wbs_element_id, wbs_code, name,
  phase_name, deliverable_sku_id, status, version, created_by, created_at, updated_at
)
SELECT p.wbs_id, p.project_id, p.contract_version_id, NULL, p.wbs_id, p.name,
       'Root', NULL, 'Active', 1, p.created_by, p.created_at, p.updated_at
FROM proj_project p
WHERE p.wbs_id IS NOT NULL AND p.wbs_id <> '';

ALTER TABLE o2c_sales_order ADD COLUMN contract_version_id TEXT;
ALTER TABLE o2c_sales_order_line ADD COLUMN contract_version_id TEXT;
ALTER TABLE o2c_sales_order_line ADD COLUMN wbs_element_id TEXT;

CREATE INDEX IF NOT EXISTS idx_o2c_sales_order_contract_version ON o2c_sales_order(contract_version_id);
CREATE INDEX IF NOT EXISTS idx_o2c_sales_order_line_contract_version ON o2c_sales_order_line(contract_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_o2c_sales_order_line_wbs_element_unique
  ON o2c_sales_order_line(wbs_element_id)
  WHERE wbs_element_id IS NOT NULL;