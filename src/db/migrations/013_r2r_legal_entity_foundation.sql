-- Phase A foundation: legal entities, ledger binding, and ledger sets

CREATE TABLE IF NOT EXISTS r2r_legal_entity (
  legal_entity_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  locale TEXT,
  parent_legal_entity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_legal_entity_id) REFERENCES r2r_legal_entity(legal_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_r2r_legal_entity_name
ON r2r_legal_entity(name);

ALTER TABLE r2r_ledger ADD COLUMN legal_entity_id TEXT REFERENCES r2r_legal_entity(legal_entity_id);

CREATE INDEX IF NOT EXISTS idx_r2r_ledger_legal_entity
ON r2r_ledger(legal_entity_id);

CREATE TABLE IF NOT EXISTS r2r_ledger_set (
  ledger_set_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_ledger_set_member (
  ledger_set_id TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (ledger_set_id, ledger_id),
  FOREIGN KEY(ledger_set_id) REFERENCES r2r_ledger_set(ledger_set_id) ON DELETE CASCADE,
  FOREIGN KEY(ledger_id) REFERENCES r2r_ledger(ledger_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_r2r_ledger_set_member_ledger
ON r2r_ledger_set_member(ledger_id);