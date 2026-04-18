-- Migration 042: Project Finished Item
CREATE TABLE IF NOT EXISTS proj_finished_item (
  finished_item_id TEXT NOT NULL PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES proj_project(project_id),
  wip_id           TEXT NOT NULL REFERENCES proj_wip(wip_id),
  sku_id           TEXT NOT NULL,
  organization_id  TEXT NOT NULL,
  quantity         REAL NOT NULL CHECK (quantity > 0),
  unit_cost        REAL NOT NULL CHECK (unit_cost >= 0),
  total_wip_cost   REAL NOT NULL CHECK (total_wip_cost >= 0),
  movement_id      TEXT,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proj_finished_item_project ON proj_finished_item(project_id);
