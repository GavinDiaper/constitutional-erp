ALTER TABLE h2r_timesheet_line ADD COLUMN project_labor_entry_id TEXT REFERENCES proj_labor_entry(entry_id);
ALTER TABLE h2r_timesheet_line ADD COLUMN project_posted_at TEXT;
ALTER TABLE proj_labor_entry ADD COLUMN source_timesheet_line_id TEXT REFERENCES h2r_timesheet_line(timesheet_line_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proj_labor_entry_timesheet_line
  ON proj_labor_entry(source_timesheet_line_id)
  WHERE source_timesheet_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_h2r_timesheet_line_project_posted
  ON h2r_timesheet_line(project_labor_entry_id, project_posted_at);