-- Add PROJ and INV authority domains (SQLite requires rebuilding tables to change CHECK constraints).
CREATE TABLE authority_position_copy AS SELECT * FROM authority_position;
DROP TABLE authority_position;

CREATE TABLE position_def_new (
  position_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  authority_domain TEXT NOT NULL CHECK (authority_domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  authority_tier INTEGER NOT NULL CHECK (authority_tier >= 1 AND authority_tier <= 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO position_def_new SELECT * FROM position_def;
DROP TABLE position_def;
ALTER TABLE position_def_new RENAME TO position_def;

CREATE TABLE authority_position (
  assignment_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  authority_domain TEXT NOT NULL CHECK (authority_domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  authority_tier INTEGER NOT NULL CHECK (authority_tier >= 1 AND authority_tier <= 5),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES authority_subject(employee_id),
  FOREIGN KEY (position_id) REFERENCES position_def(position_id)
);
INSERT INTO authority_position SELECT * FROM authority_position_copy;
DROP TABLE authority_position_copy;
CREATE INDEX IF NOT EXISTS idx_authority_position_employee_domain_active
  ON authority_position(employee_id, authority_domain, active);

CREATE TABLE authority_rule_new (
  rule_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  threshold REAL NOT NULL,
  required_tier INTEGER NOT NULL CHECK (required_tier >= 1 AND required_tier <= 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO authority_rule_new SELECT * FROM authority_rule;
DROP TABLE authority_rule;
ALTER TABLE authority_rule_new RENAME TO authority_rule;
CREATE INDEX IF NOT EXISTS idx_authority_rule_domain_threshold ON authority_rule(domain, threshold);

-- Base tier an actor needs for an action, independent of amount. Resource-specific rules use resource_type;
-- '*' matches any resource.
CREATE TABLE IF NOT EXISTS authority_action_rule (
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  resource_type TEXT NOT NULL DEFAULT '*',
  action TEXT NOT NULL,
  required_tier INTEGER NOT NULL CHECK (required_tier >= 1 AND required_tier <= 5),
  PRIMARY KEY (domain, resource_type, action)
);

INSERT OR IGNORE INTO authority_action_rule(domain, resource_type, action, required_tier) VALUES
  ('O2C', 'contract', 'create', 1),
  ('O2C', 'contract', 'amend', 2),
  ('O2C', 'contract', 'approve', 2),
  ('PROJ', 'project', 'create', 1),
  ('PROJ', 'project', 'activate', 1),
  ('PROJ', 'project', 'hold', 1),
  ('PROJ', 'project', 'resume', 1),
  ('PROJ', 'project', 'complete', 2),
  ('PROJ', 'project', 'cancel', 2);

INSERT OR IGNORE INTO authority_subject(employee_id, name, email, status, created_at, updated_at) VALUES
  ('principal.o2c-tier3', 'O2C Tier 3 Principal', 'principal.o2c-tier3@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.o2c-tier4', 'O2C Tier 4 Principal', 'principal.o2c-tier4@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.proj-tier1', 'Projects Tier 1 Principal', 'principal.proj-tier1@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.proj-tier2', 'Projects Tier 2 Principal', 'principal.proj-tier2@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.proj-tier3', 'Projects Tier 3 Principal', 'principal.proj-tier3@constitutional.local', 'Active', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO position_def(position_id, title, department, authority_domain, authority_tier, created_at, updated_at) VALUES
  ('POS-SYSTEM-PROJ-5', 'System Principal Projects Tier 5', 'Constitutional', 'PROJ', 5, datetime('now'), datetime('now')),
  ('POS-SYSTEM-INV-5', 'System Principal Inventory Tier 5', 'Constitutional', 'INV', 5, datetime('now'), datetime('now')),
  ('POS-O2C-TIER3', 'O2C Tier 3 Principal Position', 'Sales', 'O2C', 3, datetime('now'), datetime('now')),
  ('POS-O2C-TIER4', 'O2C Tier 4 Principal Position', 'Sales', 'O2C', 4, datetime('now'), datetime('now')),
  ('POS-PROJ-TIER1', 'Projects Tier 1 Principal Position', 'Delivery', 'PROJ', 1, datetime('now'), datetime('now')),
  ('POS-PROJ-TIER2', 'Projects Tier 2 Principal Position', 'Delivery', 'PROJ', 2, datetime('now'), datetime('now')),
  ('POS-PROJ-TIER3', 'Projects Tier 3 Principal Position', 'Delivery', 'PROJ', 3, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO authority_position(assignment_id, employee_id, position_id, authority_domain, authority_tier, active, created_at, updated_at) VALUES
  ('ASG-SYSTEM-PROJ-5', 'principal.system', 'POS-SYSTEM-PROJ-5', 'PROJ', 5, 1, datetime('now'), datetime('now')),
  ('ASG-SYSTEM-INV-5', 'principal.system', 'POS-SYSTEM-INV-5', 'INV', 5, 1, datetime('now'), datetime('now')),
  ('ASG-O2C-TIER3', 'principal.o2c-tier3', 'POS-O2C-TIER3', 'O2C', 3, 1, datetime('now'), datetime('now')),
  ('ASG-O2C-TIER4', 'principal.o2c-tier4', 'POS-O2C-TIER4', 'O2C', 4, 1, datetime('now'), datetime('now')),
  ('ASG-PROJ-TIER1', 'principal.proj-tier1', 'POS-PROJ-TIER1', 'PROJ', 1, 1, datetime('now'), datetime('now')),
  ('ASG-PROJ-TIER2', 'principal.proj-tier2', 'POS-PROJ-TIER2', 'PROJ', 2, 1, datetime('now'), datetime('now')),
  ('ASG-PROJ-TIER3', 'principal.proj-tier3', 'POS-PROJ-TIER3', 'PROJ', 3, 1, datetime('now'), datetime('now')),
  ('ASG-O2C-TIER2-PROJ', 'principal.o2c-tier2', 'POS-PROJ-TIER2', 'PROJ', 2, 1, datetime('now'), datetime('now'));
