import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { runMigrations } from "../src/db/migrate";
import { db } from "../src/db/connection";
import { evaluateGovernance } from "../src/domain/evaluateGovernance";

type RuleSeed = {
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

function resetState() {
  db.exec(`
    DELETE FROM governance_event;
    DELETE FROM governance_decision_log;
    DELETE FROM governance_action_history;
    DELETE FROM governance_actor_credential;
  `);
  reseedRules();
}

function listEventTypes(): string[] {
  const rows = db.prepare("SELECT event_type FROM governance_event ORDER BY timestamp ASC").all() as Array<{ event_type: string }>;
  return rows.map((row) => row.event_type);
}

function getConstraintPayloads(): Array<Record<string, unknown>> {
  const rows = db
    .prepare("SELECT payload FROM governance_event WHERE event_type = 'GovernanceConstraintApplied' ORDER BY timestamp ASC")
    .all() as Array<{ payload: string }>;

  return rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
}

before(() => {
  runMigrations();
});

beforeEach(() => {
  resetState();
});

test("authority denied returns violation and blocks action", () => {
  const result = evaluateGovernance({
    actorId: "ACT-001",
    action: "p2p_requisition_approved",
    domain: "P2P",
    context: {
      requesterId: "REQ-100",
      amount: 2500,
      currency: "USD"
    },
    authorityDecision: {
      allowed: false,
      reasons: ["InsufficientAuthority"]
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, false);
  assert.deepEqual(result.violations, ["AuthorityEngineDenied"]);

  const eventTypes = listEventTypes();
  assert.ok(eventTypes.includes("GovernanceViolationDetected"));
  assert.ok(!eventTypes.includes("GovernanceConstraintApplied"));
});

test("self approval deny emits GovernanceViolationDetected", () => {
  const result = evaluateGovernance({
    actorId: "EMP-1",
    action: "p2p_requisition_approved",
    domain: "P2P",
    context: {
      requesterId: "EMP-1",
      amount: 1200,
      currency: "USD"
    },
    authorityDecision: {
      allowed: true,
      effectiveTier: 4,
      reasons: []
    }
  });

  assert.equal(result.allowed, false);
  assert.ok(result.violations.includes("SelfApprovalNotAllowed"));

  const eventTypes = listEventTypes();
  assert.ok(eventTypes.includes("GovernanceViolationDetected"));
  assert.ok(!eventTypes.includes("GovernanceConstraintApplied"));
});

test("threshold approval returns allowed false with requiresApproval", () => {
  const result = evaluateGovernance({
    actorId: "EMP-2",
    action: "p2p_purchase_order_issued",
    domain: "P2P",
    context: {
      requesterId: "REQ-2",
      amount: 20000,
      currency: "USD"
    },
    authorityDecision: {
      allowed: true,
      effectiveTier: 2,
      reasons: []
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.requiredApproverTier, 3);
  assert.ok(result.constraints.includes("TierTooLowForThreshold"));

  const eventTypes = listEventTypes();
  assert.ok(eventTypes.includes("GovernanceConstraintApplied"));

  const payloads = getConstraintPayloads();
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].requiresApproval, true);
  assert.equal(payloads[0].requiredTier, 3);
});

test("escalation rule routes to higher tier with allowed false", () => {
  const result = evaluateGovernance({
    actorId: "EMP-3",
    action: "p2p_purchase_order_issued",
    domain: "P2P",
    context: {
      requesterId: "REQ-3",
      amount: 60000,
      currency: "USD"
    },
    authorityDecision: {
      allowed: true,
      effectiveTier: 3,
      reasons: []
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, false);
  assert.equal(result.escalatedToTier, 4);
  assert.ok(result.constraints.includes("EscalateHighValueApproval"));

  const eventTypes = listEventTypes();
  assert.ok(eventTypes.includes("GovernanceConstraintApplied"));
});

test("risk flag can keep allowed true and emits GovernanceConstraintApplied", () => {
  const result = evaluateGovernance({
    actorId: "EMP-4",
    action: "o2c_order_created",
    domain: "O2C",
    context: {
      requesterId: "REQ-4",
      amount: 30000
    },
    authorityDecision: {
      allowed: true,
      effectiveTier: 4,
      reasons: []
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.riskLevel, "High");
  assert.ok(result.constraints.includes("HighValueAction"));

  const eventTypes = listEventTypes();
  assert.ok(eventTypes.includes("GovernanceConstraintApplied"));
  assert.ok(!eventTypes.includes("GovernanceViolationDetected"));
});
