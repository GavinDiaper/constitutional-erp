ALTER TABLE proj_project ADD COLUMN baseline_budget_amount REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS proj_project_change_request (
  change_request_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  original_budget_amount REAL NOT NULL DEFAULT 0,
  delta_budget_amount REAL NOT NULL DEFAULT 0,
  revised_budget_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_project_change_request_project ON proj_project_change_request(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_project_change_request_status ON proj_project_change_request(status);

UPDATE proj_project
SET baseline_budget_amount = COALESCE(budget_amount, 0)
WHERE baseline_budget_amount IS NULL OR baseline_budget_amount = 0;
