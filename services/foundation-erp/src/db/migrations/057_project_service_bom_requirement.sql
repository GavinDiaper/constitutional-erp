CREATE TABLE IF NOT EXISTS proj_service_bom_requirement (
  requirement_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  wbs_id TEXT,
  role TEXT NOT NULL,
  estimated_hours REAL NOT NULL DEFAULT 0,
  required_skill TEXT,
  required_certification TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES proj_project(project_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_service_bom_requirement_project ON proj_service_bom_requirement(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_service_bom_requirement_wbs ON proj_service_bom_requirement(wbs_id);
