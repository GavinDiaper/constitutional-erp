-- v2: R2R Ledger entity and account/journal linkage

CREATE TABLE IF NOT EXISTS r2r_ledger (
  ledger_id             TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  currency_code         TEXT NOT NULL,
  calendar              TEXT,
  chart_of_accounts_ref TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

-- Link GL accounts and journals to a ledger (nullable for backward compat)
ALTER TABLE r2r_account ADD COLUMN ledger_id TEXT REFERENCES r2r_ledger(ledger_id);
ALTER TABLE r2r_journal ADD COLUMN ledger_id TEXT REFERENCES r2r_ledger(ledger_id);
