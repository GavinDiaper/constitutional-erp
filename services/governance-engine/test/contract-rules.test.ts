import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { evaluateGovernance } from "../src/domain/evaluateGovernance";
import { ensureTestDatabase, resetTestState } from "./testDb";

before(() => ensureTestDatabase());
beforeEach(() => resetTestState());

function contractApprove(actorId: string, tier: number, amount: number, requesterId = "creator") {
  return evaluateGovernance({
    actorId,
    action: "approve",
    domain: "O2C",
    context: { requesterId, amount, resourceType: "contract" },
    authorityDecision: { allowed: true, effectiveTier: tier, reasons: [] }
  });
}

test("contract approval up to 10000 is allowed for tier 2", () => {
  const result = contractApprove("approver", 2, 5000);
  assert.equal(result.allowed, true);
  assert.equal(result.requiresApproval, false);
});

test("contract over 10000 requires tier 3 approval and flags Medium risk", () => {
  const result = contractApprove("approver", 2, 20000);
  assert.equal(result.allowed, false);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.requiredApproverTier, 3);
  assert.equal(result.riskLevel, "Medium");
});

test("tier 3 approver satisfies the 10000 band but 100000 escalates to tier 4", () => {
  assert.equal(contractApprove("approver", 3, 50000).allowed, true);
  const high = contractApprove("approver", 3, 150000);
  assert.equal(high.allowed, false);
  assert.equal(high.escalatedToTier, 4);
  assert.equal(high.riskLevel, "High");
  assert.equal(contractApprove("approver", 4, 150000).allowed, true);
});

test("creator cannot approve their own contract regardless of tier", () => {
  const result = contractApprove("creator", 5, 500);
  assert.equal(result.allowed, false);
  assert.ok(result.violations.includes("SelfApprovalNotAllowed"));
});

test("PROJ force cancel needs tier 3", () => {
  const input = (tier: number) => evaluateGovernance({
    actorId: "pm",
    action: "cancel",
    domain: "PROJ",
    context: { requesterId: "pm", resourceType: "project", force: true },
    authorityDecision: { allowed: true, effectiveTier: tier, reasons: [] }
  });
  assert.equal(input(2).requiresApproval, true);
  assert.equal(input(2).requiredApproverTier, 3);
  assert.equal(input(3).allowed, true);
});

test("contract thresholds are configurable through governance parameters", async () => {
  const { db } = await import("../src/db/connection");
  db.prepare("UPDATE governance_parameter SET value = 2000 WHERE key = 'contract.tier3_threshold'").run();
  try {
    const result = contractApprove("approver", 2, 5000);
    assert.equal(result.requiresApproval, true);
    assert.equal(result.requiredApproverTier, 3);
  } finally {
    db.prepare("UPDATE governance_parameter SET value = 10000 WHERE key = 'contract.tier3_threshold'").run();
  }
  assert.equal(contractApprove("approver", 2, 5000).allowed, true);
});
