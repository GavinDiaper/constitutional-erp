CREATE TABLE IF NOT EXISTS identity_user (
  identity_id TEXT PRIMARY KEY,
  external_subject TEXT NOT NULL,
  external_provider TEXT NOT NULL,
  email TEXT NOT NULL,
  h2r_employee_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  UNIQUE(external_subject, external_provider),
  UNIQUE(email)
);

CREATE TABLE IF NOT EXISTS refresh_token (
  refresh_token_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(identity_id) REFERENCES identity_user(identity_id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_identity_id ON refresh_token(identity_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_expires_at ON refresh_token(expires_at);
