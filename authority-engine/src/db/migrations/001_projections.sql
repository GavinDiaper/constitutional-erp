CREATE TABLE IF NOT EXISTS authority_subject (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('Active', 'OnLeave', 'Terminated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS position_def (
  position_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  authority_domain TEXT NOT NULL CHECK (authority_domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  authority_tier INTEGER NOT NULL CHECK (authority_tier >= 1 AND authority_tier <= 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authority_position (
  assignment_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  authority_domain TEXT NOT NULL CHECK (authority_domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  authority_tier INTEGER NOT NULL CHECK (authority_tier >= 1 AND authority_tier <= 5),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES authority_subject(employee_id),
  FOREIGN KEY (position_id) REFERENCES position_def(position_id)
);

CREATE INDEX IF NOT EXISTS idx_authority_position_employee_domain_active
  ON authority_position(employee_id, authority_domain, active);

CREATE TABLE IF NOT EXISTS authority_credential (
  credential_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Valid', 'Expired', 'Revoked')),
  expiry_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES authority_subject(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_authority_credential_employee_status
  ON authority_credential(employee_id, status);

CREATE TABLE IF NOT EXISTS authority_rule (
  rule_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  threshold REAL NOT NULL,
  required_tier INTEGER NOT NULL CHECK (required_tier >= 1 AND required_tier <= 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authority_rule_domain_threshold
  ON authority_rule(domain, threshold);

CREATE TABLE IF NOT EXISTS authority_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO authority_metadata(key, value) VALUES ('replay_status', 'Booting');
INSERT OR IGNORE INTO authority_metadata(key, value) VALUES ('replay_error', '');
INSERT OR IGNORE INTO authority_metadata(key, value) VALUES ('last_event_timestamp', '');

CREATE TABLE IF NOT EXISTS authority_event (
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

CREATE INDEX IF NOT EXISTS idx_authority_event_timestamp ON authority_event(timestamp);
