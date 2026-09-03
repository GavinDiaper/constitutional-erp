CREATE TABLE IF NOT EXISTS proj_project_milestone (
  milestone_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phase_name TEXT NOT NULL DEFAULT 'General',
  billing_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'Approved', 'Completed')),
  ready_for_billing INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_project_milestone_project ON proj_project_milestone(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_project_milestone_phase ON proj_project_milestone(project_id, phase_name);
