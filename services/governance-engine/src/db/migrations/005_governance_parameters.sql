CREATE TABLE IF NOT EXISTS governance_parameter (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL,
  description TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO governance_parameter(key, value, description) VALUES
('contract.tier3_threshold', 10000, 'Contract value above which approval requires Tier 3'),
('contract.tier4_threshold', 100000, 'Contract value above which approval escalates to Tier 4');

UPDATE governance_rule SET condition_json = replace(condition_json, '"amount":10000}', '"amount":10000,"param":"contract.tier3_threshold"}')
WHERE rule_id IN ('CON-APPROVAL-001', 'CON-RISK-001');
UPDATE governance_rule SET condition_json = replace(condition_json, '"amount":100000}', '"amount":100000,"param":"contract.tier4_threshold"}')
WHERE rule_id IN ('CON-APPROVAL-002', 'CON-RISK-002');
