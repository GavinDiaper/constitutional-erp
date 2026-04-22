ALTER TABLE o2c_quote ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_o2c_quote_project ON o2c_quote(project_id, created_at);
