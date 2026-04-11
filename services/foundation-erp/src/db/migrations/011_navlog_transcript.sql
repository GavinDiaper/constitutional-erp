-- Migration 011: Add Navlog and Transcript infrastructure for Integration Hub v2

-- ── REPL Session Management ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repl_session (
  session_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_repl_session_actor ON repl_session(actor_id);
CREATE INDEX IF NOT EXISTS idx_repl_session_started ON repl_session(started_at DESC);

-- ── Navigator Log (for proposal/simulation/decision/execution tracking) ──────

CREATE TABLE IF NOT EXISTS navlog (
  navlog_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  entry_type TEXT NOT NULL, -- 'proposal' | 'simulation' | 'decision' | 'execution'
  entity_type TEXT,
  entity_id TEXT,
  action TEXT,
  actor_id TEXT,
  proposal_json TEXT,           -- Stored when entry_type = 'proposal'
  simulation_json TEXT,         -- Stored when entry_type = 'simulation'
  simulation_outcome TEXT,      -- 'success' | 'failure' | 'blocked'
  decision_json TEXT,           -- Stored when entry_type = 'decision'
  execution_json TEXT,          -- Stored when entry_type = 'execution'
  execution_result TEXT,        -- 'success' | 'failure' | 'error'
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES repl_session(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_navlog_session ON navlog(session_id);
CREATE INDEX IF NOT EXISTS idx_navlog_timestamp ON navlog(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_navlog_entry_type ON navlog(entry_type);
CREATE INDEX IF NOT EXISTS idx_navlog_entity ON navlog(entity_type, entity_id);

-- ── REPL Transcript (for command history and output capture) ────────────────

CREATE TABLE IF NOT EXISTS transcript (
  transcript_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  command TEXT NOT NULL,
  command_type TEXT NOT NULL, -- 'mcp_invoke' | 'query' | 'navigate' | 'meta'
  arguments_json TEXT,
  actor_id TEXT,
  output_json TEXT,
  output_text TEXT,
  status TEXT NOT NULL, -- 'success' | 'error' | 'partial'
  error_message TEXT,
  context_json TEXT,  -- Stores breadcrumb/state info
  execution_time_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES repl_session(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcript_session ON transcript(session_id);
CREATE INDEX IF NOT EXISTS idx_transcript_timestamp ON transcript(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_command_type ON transcript(command_type);
CREATE INDEX IF NOT EXISTS idx_transcript_status ON transcript(status);

-- ── Governance Decision Log (for recording governance checks during execution) 

CREATE TABLE IF NOT EXISTS governance_decision_log (
  decision_id TEXT PRIMARY KEY,
  navlog_id TEXT,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  domain TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_id TEXT NOT NULL,
  risk_level TEXT, -- 'Low' | 'Medium' | 'High'
  required_tier INTEGER, -- 1-5 unified authority tier
  actor_tier INTEGER,
  required_approval BOOLEAN,
  approval_granted BOOLEAN,
  decision_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (navlog_id) REFERENCES navlog(navlog_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_decision_timestamp ON governance_decision_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_governance_decision_actor ON governance_decision_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_governance_decision_action ON governance_decision_log(action);
