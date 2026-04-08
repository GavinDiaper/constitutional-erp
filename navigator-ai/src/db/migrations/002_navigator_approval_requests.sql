CREATE TABLE IF NOT EXISTS navigator_approval_request (
  approval_request_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  status TEXT NOT NULL,
  required_tier INTEGER,
  reasons_json TEXT NOT NULL,
  context_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nav_approval_request_aggregate
  ON navigator_approval_request(domain, aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nav_approval_request_status
  ON navigator_approval_request(status, updated_at DESC);