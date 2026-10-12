CREATE TABLE IF NOT EXISTS o2c_contract (
  contract_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  external_reference TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Suspended', 'Closed')),
  current_version INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES o2c_customer(customer_id),
  UNIQUE (customer_id, external_reference)
);

CREATE INDEX IF NOT EXISTS idx_o2c_contract_customer ON o2c_contract(customer_id);
CREATE INDEX IF NOT EXISTS idx_o2c_contract_status ON o2c_contract(status);

CREATE TABLE IF NOT EXISTS o2c_contract_version (
  contract_version_id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Approved', 'Superseded')),
  contract_value REAL NOT NULL CHECK (contract_value >= 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  sow_snapshot TEXT NOT NULL DEFAULT '{}',
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (contract_id, version_number),
  FOREIGN KEY (contract_id) REFERENCES o2c_contract(contract_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_o2c_contract_version_contract ON o2c_contract_version(contract_id, version_number);
CREATE INDEX IF NOT EXISTS idx_o2c_contract_version_status ON o2c_contract_version(status);