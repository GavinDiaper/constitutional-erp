-- Phase A foundation: COA combination validation rules

CREATE TABLE IF NOT EXISTS r2r_coa_combination_rule (
  rule_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_coa_combination_rule_condition (
  condition_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  segment_definition_id TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(rule_id) REFERENCES r2r_coa_combination_rule(rule_id) ON DELETE CASCADE,
  FOREIGN KEY(segment_definition_id) REFERENCES r2r_coa_segment_definition(segment_definition_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_r2r_coa_rule_condition_rule
ON r2r_coa_combination_rule_condition(rule_id);