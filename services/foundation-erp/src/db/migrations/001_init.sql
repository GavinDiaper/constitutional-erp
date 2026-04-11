CREATE TABLE IF NOT EXISTS event (
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

CREATE INDEX IF NOT EXISTS idx_event_entity ON event(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_event_timestamp ON event(timestamp);

CREATE TABLE IF NOT EXISTS replay_checkpoint (
  checkpoint_name TEXT PRIMARY KEY,
  last_event_id TEXT,
  last_timestamp TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS erp_mapping (
  mapping_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  canonical_field TEXT NOT NULL,
  oracle_field TEXT,
  sap_field TEXT,
  dynamics_field TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_mapping_domain_entity
ON erp_mapping(domain, entity_name);
