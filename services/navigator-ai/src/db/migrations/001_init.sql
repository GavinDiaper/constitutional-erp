CREATE TABLE IF NOT EXISTS navigator_llm_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  response_text TEXT NOT NULL,
  context_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nav_llm_log_context ON navigator_llm_log(context_hash, created_at);

CREATE TABLE IF NOT EXISTS navigator_ranking_decision (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  ranked_actions_json TEXT NOT NULL,
  chosen_action_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nav_ranking_aggregate
  ON navigator_ranking_decision(domain, aggregate_type, aggregate_id, created_at);

CREATE TABLE IF NOT EXISTS navigator_simulation_run (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navigator_governance_outcome (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action_id TEXT,
  outcome_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navigator_execution_trace (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navigator_repl_transcript (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  command_text TEXT NOT NULL,
  output_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navigator_cache (
  cache_key TEXT PRIMARY KEY,
  cache_value TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navigator_replay_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS navigator_event_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
