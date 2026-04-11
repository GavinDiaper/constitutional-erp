-- Phase Tax foundation: deterministic tax setup, matrix mapping, and runtime line persistence

ALTER TABLE r2r_sla_posting_profile_line ADD COLUMN tax_code TEXT;
ALTER TABLE r2r_sla_posting_profile_line ADD COLUMN tax_applicability TEXT;
ALTER TABLE r2r_sla_posting_profile_line ADD COLUMN tax_account_role TEXT;

CREATE TABLE IF NOT EXISTS tax_regime (
  tax_regime_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_jurisdiction (
  tax_jurisdiction_id TEXT PRIMARY KEY,
  tax_regime_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region_code TEXT,
  city_code TEXT,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tax_regime_id) REFERENCES tax_regime(tax_regime_id)
);

CREATE TABLE IF NOT EXISTS tax_code (
  tax_code_id TEXT PRIMARY KEY,
  tax_regime_id TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  tax_applicability TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tax_regime_id) REFERENCES tax_regime(tax_regime_id),
  UNIQUE(tax_regime_id, code),
  CHECK(tax_applicability IN ('taxable', 'exempt', 'zero-rated', 'reverse-charge', 'withholding'))
);

CREATE TABLE IF NOT EXISTS tax_rate (
  tax_rate_id TEXT PRIMARY KEY,
  tax_code_id TEXT NOT NULL,
  tax_jurisdiction_id TEXT NOT NULL,
  rate_percent REAL NOT NULL,
  inclusive_flag INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tax_code_id) REFERENCES tax_code(tax_code_id),
  FOREIGN KEY(tax_jurisdiction_id) REFERENCES tax_jurisdiction(tax_jurisdiction_id),
  CHECK(rate_percent >= 0)
);

CREATE TABLE IF NOT EXISTS tax_rule (
  tax_rule_id TEXT PRIMARY KEY,
  tax_regime_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL,
  tax_code_id TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tax_regime_id) REFERENCES tax_regime(tax_regime_id),
  FOREIGN KEY(tax_code_id) REFERENCES tax_code(tax_code_id),
  UNIQUE(tax_regime_id, code),
  CHECK(priority >= 0)
);

CREATE TABLE IF NOT EXISTS tax_account_mapping (
  tax_account_mapping_id TEXT PRIMARY KEY,
  tax_regime_id TEXT NOT NULL,
  legal_entity_id TEXT,
  tax_code_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  account_role TEXT NOT NULL,
  account_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tax_regime_id) REFERENCES tax_regime(tax_regime_id),
  FOREIGN KEY(legal_entity_id) REFERENCES r2r_legal_entity(legal_entity_id),
  FOREIGN KEY(tax_code_id) REFERENCES tax_code(tax_code_id),
  FOREIGN KEY(account_id) REFERENCES r2r_account(account_id),
  CHECK(account_role IN ('tax_liability', 'tax_recoverable', 'withholding_payable'))
);

CREATE TABLE IF NOT EXISTS tax_transaction_line (
  tax_transaction_line_id TEXT PRIMARY KEY,
  source_domain TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_event_id TEXT,
  legal_entity_id TEXT,
  tax_regime_id TEXT NOT NULL,
  tax_jurisdiction_id TEXT,
  tax_code_id TEXT NOT NULL,
  tax_rate_id TEXT,
  tax_rule_id TEXT,
  transaction_type TEXT NOT NULL,
  tax_applicability TEXT NOT NULL,
  taxable_amount REAL NOT NULL,
  tax_amount REAL NOT NULL,
  currency_code TEXT NOT NULL,
  posting_profile_id TEXT,
  accounting_status TEXT NOT NULL DEFAULT 'pending',
  accounting_journal_id TEXT,
  accounting_line_side TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(legal_entity_id) REFERENCES r2r_legal_entity(legal_entity_id),
  FOREIGN KEY(tax_regime_id) REFERENCES tax_regime(tax_regime_id),
  FOREIGN KEY(tax_jurisdiction_id) REFERENCES tax_jurisdiction(tax_jurisdiction_id),
  FOREIGN KEY(tax_code_id) REFERENCES tax_code(tax_code_id),
  FOREIGN KEY(tax_rate_id) REFERENCES tax_rate(tax_rate_id),
  FOREIGN KEY(tax_rule_id) REFERENCES tax_rule(tax_rule_id),
  FOREIGN KEY(posting_profile_id) REFERENCES r2r_sla_posting_profile(posting_profile_id),
  FOREIGN KEY(accounting_journal_id) REFERENCES r2r_journal(journal_id),
  CHECK(tax_applicability IN ('taxable', 'exempt', 'zero-rated', 'reverse-charge', 'withholding')),
  CHECK(accounting_status IN ('pending', 'posted', 'settled', 'reconciled')),
  CHECK(accounting_line_side IS NULL OR accounting_line_side IN ('debit', 'credit'))
);

CREATE INDEX IF NOT EXISTS idx_tax_rate_lookup
ON tax_rate(tax_code_id, tax_jurisdiction_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_tax_rule_lookup
ON tax_rule(tax_regime_id, is_active, priority, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_tax_account_mapping_lookup
ON tax_account_mapping(tax_regime_id, legal_entity_id, tax_code_id, transaction_type, account_role, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_tax_transaction_source
ON tax_transaction_line(source_domain, source_entity_type, source_entity_id);

CREATE INDEX IF NOT EXISTS idx_tax_transaction_status
ON tax_transaction_line(accounting_status, created_at);

CREATE INDEX IF NOT EXISTS idx_tax_transaction_code
ON tax_transaction_line(tax_code_id, transaction_type, created_at);
