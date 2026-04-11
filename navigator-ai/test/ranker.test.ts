import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, historySummary, parseRankedActions } from "../src/services/ranker";
import { NavigatorContext } from "../src/contracts/navigatorTypes";

function sampleContext(overrides: Partial<NavigatorContext> = {}): NavigatorContext {
  return {
    resource: {
      id: "SUP-1",
      domain: "P2P",
      type: "supplier",
      state: "Active",
      attributes: {},
      links: {
        acknowledge: {
          href: "/x",
          method: "POST",
          rel: "acknowledge"
        }
      }
    },
    actionOptions: [
      {
        id: "acknowledge",
        href: "/x",
        method: "POST",
        domain: "P2P",
        aggregateType: "supplier",
        aggregateId: "SUP-1",
        currentState: "Active",
        requiresApproval: false,
        riskSignals: {}
      }
    ],
    actorId: "principal.system",
    recentHistory: [],
    riskProfile: { hasApprovalActions: false },
    ...overrides
  };
}

test("historySummary includes event count and recent event types", () => {
  const summary = historySummary(
    sampleContext({
      recentHistory: [
        { eventType: "Navigator.EntityCreated" },
        { eventType: "Navigator.ActionRecommended" }
      ]
    })
  );

  assert.equal(
    summary,
    "events=2; recentTypes=Navigator.EntityCreated, Navigator.ActionRecommended"
  );
});

test("buildPrompt includes risk profile and history summary", () => {
  const prompt = buildPrompt(
    sampleContext({
      riskProfile: { hasApprovalActions: true },
      recentHistory: [{ eventType: "Navigator.EntityCreated" }]
    })
  );

  assert.match(prompt, /Risk profile: \{"hasApprovalActions":true\}/);
  assert.match(prompt, /Recent history: events=1; recentTypes=Navigator\.EntityCreated/);
});

test("parseRankedActions parses JSON array and clamps score", () => {
  const parsed = parseRankedActions('[{"actionId":"approve","score":2.5,"rationale":"ok"}]');
  assert.ok(parsed);
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0]?.actionId, "approve");
  assert.equal(parsed?.[0]?.score, 1);
});
