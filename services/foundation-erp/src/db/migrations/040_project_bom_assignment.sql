-- Migration 040: Project BOM Assignment
-- Links a BOM to a project/WBS with planned quantity and status tracking.

CREATE TABLE IF NOT EXISTS proj_bom_assignment (
  assignment_id   TEXT NOT NULL PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES proj_project(project_id),
  wbs_id          TEXT,
  bom_id          TEXT NOT NULL REFERENCES inv_bom_header(bom_id),
  quantity_planned REAL NOT NULL CHECK (quantity_planned > 0),
  status          TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Cancelled')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proj_bom_assignment_project ON proj_bom_assignment(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_bom_assignment_bom    ON proj_bom_assignment(bom_id);
