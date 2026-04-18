-- Projects fix: align proj_wip schema with service expectations

ALTER TABLE proj_wip ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
