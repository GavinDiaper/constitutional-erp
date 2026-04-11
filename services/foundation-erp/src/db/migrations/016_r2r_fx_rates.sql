-- Phase A foundation: FX rate types and FX rates

CREATE TABLE IF NOT EXISTS r2r_fx_rate_type (
  rate_type_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2r_fx_rate (
  rate_id TEXT PRIMARY KEY,
  rate_type_id TEXT NOT NULL,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(rate_type_id) REFERENCES r2r_fx_rate_type(rate_type_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_r2r_fx_rate_lookup
ON r2r_fx_rate(rate_type_id, from_currency, to_currency, valid_from);