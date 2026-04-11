-- PGE-owned tables only.
-- Aggregate state is NOT stored here; it is always reconstructed from the
-- Event Processor (ledger). PGE owns:
--   1. pge_approval_task  – pending approval work items
--   2. pge_command_log    – audit/idempotency record of executed transitions

CREATE TABLE IF NOT EXISTS pge_approval_task (
  id              TEXT PRIMARY KEY,
  domain          TEXT NOT NULL,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  action          TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  required_approver_tier  INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'Pending',   -- Pending | Approved | Rejected
  created_at      TEXT NOT NULL,
  resolved_at     TEXT,
  resolved_by     TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_pge_approval_task_aggregate
  ON pge_approval_task(domain, aggregate_type, aggregate_id, status);

CREATE INDEX IF NOT EXISTS idx_pge_approval_task_status
  ON pge_approval_task(status, created_at);

CREATE TABLE IF NOT EXISTS pge_command_log (
  id               TEXT PRIMARY KEY,
  domain           TEXT NOT NULL,
  aggregate_type   TEXT NOT NULL,
  aggregate_id     TEXT NOT NULL,
  action           TEXT NOT NULL,
  actor_id         TEXT NOT NULL,
  projected_state  TEXT NOT NULL,
  payload_json     TEXT NOT NULL,
  mesh_delegated   INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pge_command_log_aggregate
  ON pge_command_log(domain, aggregate_type, aggregate_id, created_at);
