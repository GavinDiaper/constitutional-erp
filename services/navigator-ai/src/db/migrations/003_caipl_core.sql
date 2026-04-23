CREATE TABLE IF NOT EXISTS caipl_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  current_goal TEXT NOT NULL,
  current_step_id TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caipl_session_user ON caipl_session(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS caipl_turn (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  message_text TEXT NOT NULL,
  linked_nodes_json TEXT NOT NULL,
  linked_artefacts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES caipl_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caipl_turn_session_created ON caipl_turn(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS caipl_decision (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  status TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  version INTEGER NOT NULL,
  options_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES caipl_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caipl_decision_session_updated ON caipl_decision(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS caipl_plan_node (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES caipl_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caipl_plan_node_session ON caipl_plan_node(session_id, updated_at ASC);

CREATE TABLE IF NOT EXISTS caipl_plan_edge (
  edge_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES caipl_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caipl_plan_edge_session ON caipl_plan_edge(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS caipl_notebook_artefact (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  artefact_type TEXT NOT NULL,
  content_json TEXT,
  content_text TEXT,
  linked_node_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES caipl_session(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caipl_notebook_session ON caipl_notebook_artefact(session_id, updated_at ASC);
