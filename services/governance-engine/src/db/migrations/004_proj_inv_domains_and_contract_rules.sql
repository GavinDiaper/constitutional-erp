-- Allow PROJ and INV domains (CHECK constraints require table rebuilds in SQLite).
CREATE TABLE governance_rule_new (
  rule_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('GLOBAL', 'O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  description TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  effect_json TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO governance_rule_new SELECT * FROM governance_rule;
DROP TABLE governance_rule;
ALTER TABLE governance_rule_new RENAME TO governance_rule;
CREATE INDEX IF NOT EXISTS idx_governance_rule_domain_priority ON governance_rule(domain, priority, is_active);

CREATE TABLE governance_action_history_new (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_event_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(source_event_id, actor_id, action)
);
INSERT INTO governance_action_history_new SELECT * FROM governance_action_history;
DROP TABLE governance_action_history;
ALTER TABLE governance_action_history_new RENAME TO governance_action_history;
CREATE INDEX IF NOT EXISTS idx_governance_action_history_actor_domain
  ON governance_action_history(actor_id, domain, action, occurred_at);

CREATE TABLE governance_decision_log_new (
  decision_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  decision TEXT NOT NULL CHECK (decision IN ('Allow', 'Deny')),
  requires_approval INTEGER NOT NULL CHECK (requires_approval IN (0, 1)),
  required_approver_tier INTEGER,
  escalated_to_tier INTEGER,
  risk_level TEXT CHECK (risk_level IN ('Low', 'Medium', 'High')),
  violations TEXT NOT NULL,
  matched_rules TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
INSERT INTO governance_decision_log_new SELECT * FROM governance_decision_log;
DROP TABLE governance_decision_log;
ALTER TABLE governance_decision_log_new RENAME TO governance_decision_log;
CREATE INDEX IF NOT EXISTS idx_governance_decision_log_actor
  ON governance_decision_log(actor_id, domain, timestamp);

-- Rules keyed on the generic action names the Mesh Gateway sends (approve, cancel, ...).
INSERT OR IGNORE INTO governance_rule(rule_id, domain, description, condition_json, effect_json, priority, is_active, created_at, updated_at) VALUES
('SOD-GLOBAL-001', 'GLOBAL', 'No self-approval: the approver may not be the requester',
 '{"type":"And","conditions":[{"type":"ActionIs","action":"approve"},{"type":"ActorIsRequester"}]}',
 '{"type":"Deny","reason":"SelfApprovalNotAllowed"}', 5, 1, datetime('now'), datetime('now')),
('CON-APPROVAL-001', 'O2C', 'Contracts over 10000 require Tier 3 approval',
 '{"type":"And","conditions":[{"type":"ActionIs","action":"approve"},{"type":"ContextEquals","field":"resourceType","value":"contract"},{"type":"AmountGreaterThan","amount":10000},{"type":"TierLessThan","tier":3}]}',
 '{"type":"RequireApproval","approverTier":3,"reason":"ContractValueRequiresTier3"}', 20, 1, datetime('now'), datetime('now')),
('CON-APPROVAL-002', 'O2C', 'Contracts over 100000 escalate to Tier 4',
 '{"type":"And","conditions":[{"type":"ActionIs","action":"approve"},{"type":"ContextEquals","field":"resourceType","value":"contract"},{"type":"AmountGreaterThan","amount":100000},{"type":"TierLessThan","tier":4}]}',
 '{"type":"Escalate","toTier":4,"reason":"ContractValueEscalatesToTier4"}', 30, 1, datetime('now'), datetime('now')),
('CON-RISK-001', 'O2C', 'Flag Medium risk for contracts over 10000',
 '{"type":"And","conditions":[{"type":"ContextEquals","field":"resourceType","value":"contract"},{"type":"AmountGreaterThan","amount":10000}]}',
 '{"type":"FlagRisk","level":"Medium","reason":"MediumValueContract"}', 40, 1, datetime('now'), datetime('now')),
('CON-RISK-002', 'O2C', 'Flag High risk for contracts over 100000',
 '{"type":"And","conditions":[{"type":"ContextEquals","field":"resourceType","value":"contract"},{"type":"AmountGreaterThan","amount":100000}]}',
 '{"type":"FlagRisk","level":"High","reason":"HighValueContract"}', 41, 1, datetime('now'), datetime('now')),
('PROJ-CANCEL-FORCE-001', 'PROJ', 'Force-cancelling a project requires Tier 3 approval',
 '{"type":"And","conditions":[{"type":"ActionIs","action":"cancel"},{"type":"ContextEquals","field":"force","value":true},{"type":"TierLessThan","tier":3}]}',
 '{"type":"RequireApproval","approverTier":3,"reason":"ForceCancelRequiresTier3"}', 20, 1, datetime('now'), datetime('now')),
('PROJ-RISK-001', 'PROJ', 'Flag Medium risk for project cancellation',
 '{"type":"ActionIs","action":"cancel"}',
 '{"type":"FlagRisk","level":"Medium","reason":"ProjectCancellation"}', 40, 1, datetime('now'), datetime('now'));
