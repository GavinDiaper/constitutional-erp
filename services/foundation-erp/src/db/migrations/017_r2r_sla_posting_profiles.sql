-- Phase B starter: SLA posting profiles

CREATE TABLE IF NOT EXISTS r2r_sla_posting_profile (
  posting_profile_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_sla_posting_profile_line (
  posting_profile_line_id TEXT PRIMARY KEY,
  posting_profile_id TEXT NOT NULL,
  entry_side TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount_source TEXT NOT NULL,
  memo_template TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(posting_profile_id) REFERENCES r2r_sla_posting_profile(posting_profile_id) ON DELETE CASCADE,
  FOREIGN KEY(account_id) REFERENCES r2r_account(account_id),
  CHECK(entry_side IN ('debit', 'credit'))
);

CREATE INDEX IF NOT EXISTS idx_r2r_sla_posting_profile_event
ON r2r_sla_posting_profile(event_type);