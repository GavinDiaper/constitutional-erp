CREATE TABLE IF NOT EXISTS proj_project_risk (
  risk_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  probability_percent REAL NOT NULL DEFAULT 0,
  impact_amount REAL NOT NULL DEFAULT 0,
  financial_exposure REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_project_risk_project ON proj_project_risk(project_id);

CREATE TABLE IF NOT EXISTS proj_stage_gate (
  gate_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_name TEXT NOT NULL,
  required_signoffs TEXT NOT NULL DEFAULT '',
  approvals TEXT NOT NULL DEFAULT '',
  is_ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, phase_name),
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_stage_gate_project ON proj_stage_gate(project_id);
