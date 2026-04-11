CREATE TABLE IF NOT EXISTS ledger_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_stream_id TEXT NOT NULL,
  source_sequence INTEGER NOT NULL,
  correlation_id TEXT,
  causation_id TEXT,
  actor_id TEXT,
  ingress_id TEXT,
  impersonated INTEGER NOT NULL DEFAULT 0,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  tenant_id TEXT,
  payload_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_events_source_dedupe
  ON ledger_events(source_system, source_stream_id, source_sequence);

CREATE INDEX IF NOT EXISTS idx_ledger_events_aggregate
  ON ledger_events(domain, aggregate_type, aggregate_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS idx_ledger_events_correlation
  ON ledger_events(correlation_id);

CREATE INDEX IF NOT EXISTS idx_ledger_events_source_system
  ON ledger_events(source_system, occurred_at, id);

CREATE TABLE IF NOT EXISTS ledger_dead_letter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_system TEXT NOT NULL,
  source_cursor TEXT,
  error_code TEXT NOT NULL,
  error_detail TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_dead_letter_source_created
  ON ledger_dead_letter(source_system, created_at);

CREATE TABLE IF NOT EXISTS cep_source_cursor (
  source_system TEXT PRIMARY KEY,
  cursor TEXT,
  last_event_at TEXT,
  last_status TEXT NOT NULL,
  last_error TEXT,
  last_polled_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cep_runtime_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO cep_runtime_metadata(key, value) VALUES ('startup_status', 'Booting');
INSERT OR IGNORE INTO cep_runtime_metadata(key, value) VALUES ('startup_error', '');