-- Phase A foundation: COA hierarchy and account segmentation

ALTER TABLE r2r_account ADD COLUMN parent_account_id TEXT REFERENCES r2r_account(account_id);

CREATE INDEX IF NOT EXISTS idx_r2r_account_parent
ON r2r_account(parent_account_id);

CREATE TABLE IF NOT EXISTS r2r_coa_segment_definition (
  segment_definition_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_account_segment_value (
  account_id TEXT NOT NULL,
  segment_definition_id TEXT NOT NULL,
  segment_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, segment_definition_id),
  FOREIGN KEY(account_id) REFERENCES r2r_account(account_id) ON DELETE CASCADE,
  FOREIGN KEY(segment_definition_id) REFERENCES r2r_coa_segment_definition(segment_definition_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_r2r_account_segment_definition
ON r2r_account_segment_value(segment_definition_id);