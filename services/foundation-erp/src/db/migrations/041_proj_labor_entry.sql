-- Migration 041: Project Labour Entry
CREATE TABLE IF NOT EXISTS proj_labor_entry (
  entry_id        TEXT NOT NULL PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES proj_project(project_id),
  wip_id          TEXT NOT NULL REFERENCES proj_wip(wip_id),
  wbs_id          TEXT,
  resource_id     TEXT NOT NULL,
  hours           REAL NOT NULL CHECK (hours > 0),
  rate            REAL NOT NULL CHECK (rate >= 0),
  total_cost      REAL NOT NULL CHECK (total_cost >= 0),
  cost_element_id TEXT,
  posted_at       TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proj_labor_entry_project ON proj_labor_entry(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_labor_entry_wip     ON proj_labor_entry(wip_id);
