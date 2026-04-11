CREATE TABLE IF NOT EXISTS r2r_account (
  account_id TEXT PRIMARY KEY,
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_fiscal_year (
  fiscal_year_id TEXT PRIMARY KEY,
  year_label TEXT NOT NULL,
  state TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_fiscal_period (
  fiscal_period_id TEXT PRIMARY KEY,
  fiscal_year_id TEXT NOT NULL,
  period_number INTEGER NOT NULL,
  state TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(fiscal_year_id) REFERENCES r2r_fiscal_year(fiscal_year_id)
);

CREATE TABLE IF NOT EXISTS r2r_journal (
  journal_id TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL,
  description TEXT,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(fiscal_period_id) REFERENCES r2r_fiscal_period(fiscal_period_id)
);

CREATE TABLE IF NOT EXISTS r2r_journal_line (
  journal_line_id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit_amount REAL NOT NULL DEFAULT 0,
  credit_amount REAL NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(journal_id) REFERENCES r2r_journal(journal_id) ON DELETE CASCADE,
  FOREIGN KEY(account_id) REFERENCES r2r_account(account_id)
);

CREATE TABLE IF NOT EXISTS r2r_ledger_entry (
  ledger_entry_id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  posting_date TEXT NOT NULL,
  debit_amount REAL NOT NULL DEFAULT 0,
  credit_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(journal_id) REFERENCES r2r_journal(journal_id),
  FOREIGN KEY(account_id) REFERENCES r2r_account(account_id)
);

CREATE TABLE IF NOT EXISTS r2r_trial_balance_row (
  trial_balance_row_id TEXT PRIMARY KEY,
  fiscal_period_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit_total REAL NOT NULL DEFAULT 0,
  credit_total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(fiscal_period_id) REFERENCES r2r_fiscal_period(fiscal_period_id),
  FOREIGN KEY(account_id) REFERENCES r2r_account(account_id)
);
