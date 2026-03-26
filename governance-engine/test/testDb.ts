import { db } from "../src/db/connection";
import { runMigrations } from "../src/db/migrate";
import { setReplayStatus } from "../src/projection/state";

export type RuleSeed = {
  ruleId: string;
  domain: "GLOBAL" | "O2C" | "P2P" | "R2R" | "H2R";
  description: string;
  conditionJson: string;
  effectJson: string;
  priority: number;
};

const RULES: RuleSeed[] = [
  {
    ruleId: "SOD-001",
    domain: "P2P",
    description: "Prevent self-approval for requisition approvals in P2P",
    conditionJson:
      '{"type":"And","conditions":[{"type":"ActionIs","action":"p2p_requisition_approved"},{"type":"ActorIsRequester"}]}',
    effectJson: '{"type":"Deny","reason":"SelfApprovalNotAllowed"}',
    priority: 10
  },
  {
    ruleId: "P2P-THRESHOLD-001",
    domain: "P2P",
    description: "Require Tier 3 approval for purchase orders over 10000",
    conditionJson:
      '{"type":"And","conditions":[{"type":"ActionIs","action":"p2p_purchase_order_issued"},{"type":"AmountGreaterThan","amount":10000},{"type":"TierLessThan","tier":3}]}',
    effectJson: '{"type":"RequireApproval","approverTier":3,"reason":"TierTooLowForThreshold"}',
    priority: 20
  },
  {
    ruleId: "P2P-THRESHOLD-002",
    domain: "P2P",
    description: "Escalate purchase orders over 50000 to Tier 4",
    conditionJson:
      '{"type":"And","conditions":[{"type":"ActionIs","action":"p2p_purchase_order_issued"},{"type":"AmountGreaterThan","amount":50000},{"type":"TierLessThan","tier":4}]}',
    effectJson: '{"type":"Escalate","toTier":4,"reason":"EscalateHighValueApproval"}',
    priority: 30
  },
  {
    ruleId: "RISK-001",
    domain: "GLOBAL",
    description: "Flag risk for high-value actions over 25000",
    conditionJson: '{"type":"AmountGreaterThan","amount":25000}',
    effectJson: '{"type":"FlagRisk","level":"High","reason":"HighValueAction"}',
    priority: 40
  }
];

let initialized = false;

export function ensureTestDatabase() {
  if (initialized) {
    return;
  }

  runMigrations();
  initialized = true;
}

function reseedRules() {
  db.exec("DELETE FROM governance_rule;");
  const insert = db.prepare(`
    INSERT INTO governance_rule(
      rule_id,
      domain,
      description,
      condition_json,
      effect_json,
      priority,
      is_active,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  for (const rule of RULES) {
    insert.run(rule.ruleId, rule.domain, rule.description, rule.conditionJson, rule.effectJson, rule.priority);
  }
}

export function resetTestState() {
  db.exec(`
    DELETE FROM governance_event;
    DELETE FROM governance_decision_log;
    DELETE FROM governance_action_history;
    DELETE FROM governance_actor_credential;
  `);
  reseedRules();
  setReplayStatus("Ready");
}

export function listEventTypes(): string[] {
  const rows = db.prepare("SELECT event_type FROM governance_event ORDER BY timestamp ASC").all() as Array<{ event_type: string }>;
  return rows.map((row) => row.event_type);
}

export function getConstraintPayloads(): Array<Record<string, unknown>> {
  const rows = db
    .prepare("SELECT payload FROM governance_event WHERE event_type = 'GovernanceConstraintApplied' ORDER BY timestamp ASC")
    .all() as Array<{ payload: string }>;

  return rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
}
