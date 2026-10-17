import assert from "node:assert/strict";
import test, { before } from "node:test";

process.env.DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

let evaluateAuthority: typeof import("../src/domain/evaluateAuthority").evaluateAuthority;

before(async () => {
  const { runMigrations } = await import("../src/db/migrate");
  runMigrations();
  ({ evaluateAuthority } = await import("../src/domain/evaluateAuthority"));
});

test("contract approve requires tier 2 in O2C and does not need a FinancialApproval credential", () => {
  const ok = evaluateAuthority({ actorId: "principal.o2c-tier2", action: "approve", domain: "O2C", context: { resourceType: "contract" } });
  assert.equal(ok.allowed, true);
  assert.equal(ok.requiredTier, 2);
});

test("PROJ domain tiers come from action rules", () => {
  const low = evaluateAuthority({ actorId: "principal.proj-tier1", action: "complete", domain: "PROJ", context: { resourceType: "project" } });
  assert.equal(low.allowed, false);
  assert.equal(low.effectiveTier, 1);
  assert.equal(low.requiredTier, 2);

  const ok = evaluateAuthority({ actorId: "principal.proj-tier2", action: "complete", domain: "PROJ", context: { resourceType: "project" } });
  assert.equal(ok.allowed, true);

  const activate = evaluateAuthority({ actorId: "principal.proj-tier1", action: "activate", domain: "PROJ", context: { resourceType: "project" } });
  assert.equal(activate.allowed, true);
});

test("actor without a position in the domain is denied", () => {
  const result = evaluateAuthority({ actorId: "principal.proj-tier3", action: "approve", domain: "O2C", context: { resourceType: "contract" } });
  assert.equal(result.allowed, false);
  assert.equal(result.effectiveTier, 0);
});

test("inventory adjustments, cost rates and milestone approval are tier-gated by action rules", () => {
  const adjust = (actorId: string) =>
    evaluateAuthority({ actorId, action: "adjust", domain: "INV", context: { resourceType: "inventory-movement" } });
  assert.equal(adjust("principal.inv-tier1").allowed, false);
  assert.equal(adjust("principal.inv-tier2").allowed, true);

  const cost = evaluateAuthority({ actorId: "principal.inv-tier2", action: "cost_update", domain: "INV", context: { resourceType: "inventory-movement" } });
  assert.equal(cost.allowed, false);
  assert.equal(cost.requiredTier, 3);

  const rate = (actorId: string) =>
    evaluateAuthority({ actorId, action: "create", domain: "H2R", context: { resourceType: "employee-cost-rate" } });
  assert.equal(rate("principal.h2r-tier2").allowed, false);
  assert.equal(rate("principal.h2r-tier4").allowed, true);

  const milestone = evaluateAuthority({ actorId: "principal.proj-tier2", action: "approve", domain: "PROJ", context: { resourceType: "milestone" } });
  assert.equal(milestone.allowed, true);
});
