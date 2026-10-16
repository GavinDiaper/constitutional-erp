-- Allow PROJ and INV domains on approval tasks (CHECK change needs a table rebuild).
CREATE TABLE mesh_approval_assignment_copy AS SELECT * FROM mesh_approval_assignment;
DROP TABLE mesh_approval_assignment;

CREATE TABLE mesh_approval_task_new (
  task_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  rejected_by TEXT,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R', 'PROJ', 'INV')),
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  required_tier INTEGER,
  escalated_to_tier INTEGER,
  original_request_path TEXT NOT NULL,
  original_request_body TEXT NOT NULL,
  context_json TEXT NOT NULL,
  decision_snapshot_json TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  adapter_id TEXT,
  resource_type TEXT,
  mesh_action_path TEXT
);
INSERT INTO mesh_approval_task_new(
  task_id, status, requested_by, approved_by, rejected_by, domain, resource_id, action, required_tier, escalated_to_tier,
  original_request_path, original_request_body, context_json, decision_snapshot_json, request_fingerprint,
  rejection_reason, created_at, updated_at, adapter_id, resource_type, mesh_action_path
) SELECT
  task_id, status, requested_by, approved_by, rejected_by, domain, resource_id, action, required_tier, escalated_to_tier,
  original_request_path, original_request_body, context_json, decision_snapshot_json, request_fingerprint,
  rejection_reason, created_at, updated_at, adapter_id, resource_type, mesh_action_path
FROM mesh_approval_task;
DROP TABLE mesh_approval_task;
ALTER TABLE mesh_approval_task_new RENAME TO mesh_approval_task;
CREATE INDEX IF NOT EXISTS idx_mesh_approval_task_status_created ON mesh_approval_task(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mesh_approval_task_fingerprint_status ON mesh_approval_task(request_fingerprint, status);

CREATE TABLE mesh_approval_assignment (
  task_id TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (task_id, approver_id),
  FOREIGN KEY (task_id) REFERENCES mesh_approval_task(task_id)
);
INSERT INTO mesh_approval_assignment SELECT * FROM mesh_approval_assignment_copy;
DROP TABLE mesh_approval_assignment_copy;
CREATE INDEX IF NOT EXISTS idx_mesh_approval_assignment_approver ON mesh_approval_assignment(approver_id, task_id);
