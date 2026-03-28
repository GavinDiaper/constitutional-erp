import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { evaluateGovernance } from "../src/domain/evaluateGovernance";
import { ensureTestDatabase, getConstraintPayloads, listEventTypes, resetTestState } from "./testDb";
import { db } from "../src/db/connection";

before(() => {
  ensureTestDatabase();
});

beforeEach(() => {
  resetTestState();
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

test("create action does not require approval when only stage/verb rule matches", () => {
  db.prepare(
    `INSERT INTO governance_rule(
      rule_id, domain, description, condition_json, effect_json, priority, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
  ).run(
    "CREATE-ONLY-APPROVAL",
    "P2P",
    "Incorrect stage-only approval rule",
    JSON.stringify({ type: "ActionIs", action: "p2p_requisition_create" }),
    JSON.stringify({ type: "RequireApproval", approverTier: 2, reason: "StageOnlyApproval" }),
    5
  );

  const result = evaluateGovernance({
    actorId: "EMP-10",
    action: "p2p_requisition_create",
    domain: "P2P",
    context: {
      requesterId: "REQ-10",
      amount: 100,
      currency: "USD"
    },
    authorityDecision: {
      allowed: true,
      effectiveTier: 4,
      reasons: []
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.requiresApproval, false);
  assert.ok(result.constraints.includes("CreateOrInitiateDefaultsNoApproval"));
});

test("create action allows explicit constitutional mandate approval rule", () => {
  db.prepare(
    `INSERT INTO governance_rule(
      rule_id, domain, description, condition_json, effect_json, priority, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
  ).run(
    "CREATE-CONSTITUTIONAL-APPROVAL",
    "P2P",
    "Constitutional mandate approval rule",
    JSON.stringify({ type: "ActionIs", action: "p2p_requisition_create" }),
    JSON.stringify({ type: "RequireApproval", approverTier: 2, reason: "ConstitutionalMandate_CreateControl" }),
    5
  );

  const result = evaluateGovernance({
    actorId: "EMP-11",
    action: "p2p_requisition_create",
    domain: "P2P",
    context: {
      requesterId: "REQ-11",
      amount: 100,
      currency: "USD"
    },
    authorityDecision: {
      allowed: true,
      effectiveTier: 1,
      reasons: []
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.requiredApproverTier, 2);
  assert.ok(result.constraints.includes("ConstitutionalMandate_CreateControl"));
});
