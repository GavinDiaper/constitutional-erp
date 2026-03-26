CREATE TABLE IF NOT EXISTS mesh_projection_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO mesh_projection_metadata(key, value) VALUES ('startup_status', 'Booting');
INSERT OR IGNORE INTO mesh_projection_metadata(key, value) VALUES ('startup_error', '');

CREATE TABLE IF NOT EXISTS mesh_approval_task (
  task_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  rejected_by TEXT,
  domain TEXT NOT NULL CHECK (domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mesh_approval_task_status_created
  ON mesh_approval_task(status, created_at);

CREATE INDEX IF NOT EXISTS idx_mesh_approval_task_fingerprint_status
  ON mesh_approval_task(request_fingerprint, status);

CREATE TABLE IF NOT EXISTS mesh_approval_assignment (
  task_id TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (task_id, approver_id),
  FOREIGN KEY (task_id) REFERENCES mesh_approval_task(task_id)
);

CREATE INDEX IF NOT EXISTS idx_mesh_approval_assignment_approver
  ON mesh_approval_assignment(approver_id, task_id);

CREATE TABLE IF NOT EXISTS mesh_decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  domain TEXT,
  action TEXT,
  resource TEXT,
  decision TEXT,
  reason TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mesh_decision_log_created
  ON mesh_decision_log(created_at);
