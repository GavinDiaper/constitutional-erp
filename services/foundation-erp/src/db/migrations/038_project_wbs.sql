-- Projects enhancement: add explicit WBS identifier to project master

ALTER TABLE proj_project ADD COLUMN wbs_id TEXT;

CREATE INDEX IF NOT EXISTS idx_proj_project_wbs
ON proj_project(wbs_id);
