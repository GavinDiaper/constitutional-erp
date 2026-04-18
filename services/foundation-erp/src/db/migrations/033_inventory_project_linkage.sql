-- Phase 1 inventory-project linkage extension
-- Adds optional project context to inventory movement rows.

ALTER TABLE inv_movement ADD COLUMN project_id TEXT;
ALTER TABLE inv_movement ADD COLUMN project_wip_id TEXT;
ALTER TABLE inv_movement ADD COLUMN bom_id TEXT;
ALTER TABLE inv_movement ADD COLUMN bom_component_flag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inv_movement ADD COLUMN is_project_finished_good INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inv_movement_project ON inv_movement(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_movement_project_wip ON inv_movement(project_wip_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_movement_bom ON inv_movement(bom_id, created_at);
