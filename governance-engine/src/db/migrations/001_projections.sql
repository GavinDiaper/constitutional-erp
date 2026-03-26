CREATE TABLE IF NOT EXISTS governance_rule (
  rule_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('GLOBAL', 'O2C', 'P2P', 'R2R', 'H2R')),
  description TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  effect_json TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_rule_domain_priority
  ON governance_rule(domain, priority, is_active);

CREATE TABLE IF NOT EXISTS governance_projection_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO governance_projection_metadata(key, value) VALUES ('replay_status', 'Booting');
INSERT OR IGNORE INTO governance_projection_metadata(key, value) VALUES ('replay_error', '');
INSERT OR IGNORE INTO governance_projection_metadata(key, value) VALUES ('last_event_timestamp', '');

CREATE TABLE IF NOT EXISTS governance_actor_credential (
  credential_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Valid', 'Expired', 'Revoked')),
  expiry_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_actor_credential_lookup
  ON governance_actor_credential(actor_id, credential_type, status);

CREATE TABLE IF NOT EXISTS governance_action_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_event_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(source_event_id, actor_id, action)
);

CREATE INDEX IF NOT EXISTS idx_governance_action_history_actor_domain
  ON governance_action_history(actor_id, domain, action, occurred_at);

CREATE TABLE IF NOT EXISTS governance_decision_log (
  decision_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  decision TEXT NOT NULL CHECK (decision IN ('Allow', 'Deny')),
  requires_approval INTEGER NOT NULL CHECK (requires_approval IN (0, 1)),
  required_approver_tier INTEGER,
  escalated_to_tier INTEGER,
  risk_level TEXT CHECK (risk_level IN ('Low', 'Medium', 'High')),
  violations TEXT NOT NULL,
  matched_rules TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_decision_log_actor
  ON governance_decision_log(actor_id, domain, timestamp);

CREATE TABLE IF NOT EXISTS governance_event (
  event_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  payload TEXT NOT NULL,
  correlation_id TEXT,
  causation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_governance_event_timestamp
  ON governance_event(timestamp);

INSERT OR IGNORE INTO governance_rule(
  rule_id,
  domain,
  description,
  condition_json,
  effect_json,
  priority,
  is_active,
  created_at,
  updated_at
) VALUES
(
  'SOD-001',
  'P2P',
  'Prevent self-approval in P2P',
  '{"type":"And","conditions":[{"type":"ActionIs","action":"approve"},{"type":"ActorIsRequester"}]}',
  '{"type":"Deny","reason":"SelfApprovalNotAllowed"}',
  10,
  1,
  datetime('now'),
  datetime('now')
),
(
  'P2P-THRESHOLD-001',
  'P2P',
  'Require Tier 3 approval for purchase approvals over 10000',
  '{"type":"And","conditions":[{"type":"ActionIs","action":"approve"},{"type":"AmountGreaterThan","amount":10000},{"type":"TierLessThan","tier":3}]}',
  '{"type":"RequireApproval","approverTier":3,"reason":"TierTooLowForThreshold"}',
  20,
  1,
  datetime('now'),
  datetime('now')
),
(
  'P2P-THRESHOLD-002',
  'P2P',
  'Escalate approvals over 50000 to Tier 4',
  '{"type":"And","conditions":[{"type":"ActionIs","action":"approve"},{"type":"AmountGreaterThan","amount":50000},{"type":"TierLessThan","tier":4}]}',
  '{"type":"Escalate","toTier":4,"reason":"EscalateHighValueApproval"}',
  30,
  1,
  datetime('now'),
  datetime('now')
),
(
  'RISK-001',
  'GLOBAL',
  'Flag risk for high-value actions over 25000',
  '{"type":"AmountGreaterThan","amount":25000}',
  '{"type":"FlagRisk","level":"High","reason":"HighValueAction"}',
  40,
  1,
  datetime('now'),
  datetime('now')
);
