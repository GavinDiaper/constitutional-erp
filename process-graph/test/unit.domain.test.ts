import assert from "node:assert/strict";
import test from "node:test";

process.env.API_KEY = "test-key";
process.env.EVENT_PROCESSOR_API_KEY = "test-key";
process.env.AUTHORITY_ENGINE_API_KEY = "test-key";
process.env.GOVERNANCE_ENGINE_API_KEY = "test-key";
process.env.MESH_GATEWAY_API_KEY = "test-key";

const {
  getTransitionsForAggregate,
  resolveTransitionById,
  getAvailableTransitions
} = require("../src/domain/transitions/registry");
const { replayEvents } = require("../src/domain/reducers/registry");
const { evaluateTransition } = require("../src/domain/policy/evaluateTransition");

function makeLedgerEvent(overrides: {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  domain: string;
  payload?: Record<string, unknown>;
}) {
  return {
    eventId: `EVT-${overrides.aggregateId}-${overrides.eventType}`,
    eventType: overrides.eventType,
    eventVersion: 1,
    occurredAt: "2026-03-27T12:00:00.000Z",
    source: { system: "foundation-erp", streamId: overrides.aggregateId, sequence: 0 },
    correlation: {},
    actor: { impersonated: false },
    domain: {
      domain: overrides.domain,
      aggregateType: overrides.aggregateType,
      aggregateId: overrides.aggregateId
    },
    payload: overrides.payload ?? {},
    metadata: { schemaVersion: 1, tags: [overrides.domain], flags: { isReplay: false, isSynthetic: false } }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("transition registries expose expected counts and stable ids", () => {
  assert.equal(getTransitionsForAggregate("P2P", "requisition").length, 5);
  assert.equal(getTransitionsForAggregate("P2P", "purchase-order").length, 6);
  assert.equal(getTransitionsForAggregate("O2C", "sales-order").length, 6);
  assert.equal(getTransitionsForAggregate("R2R", "period").length, 3);
  assert.equal(getTransitionsForAggregate("H2R", "leave-request").length, 5);

  const transition = resolveTransitionById("P2P.PurchaseOrder.receive");
  assert.ok(transition);
  assert.deepEqual(transition?.toStates, ["PartiallyReceived", "FullyReceived"]);
});

test("available transition derivation handles multi-state edges", () => {
  const poActions = getAvailableTransitions("P2P", "purchase-order", "PartiallyReceived").map((item: { action: string }) => item.action);
  const soActions = getAvailableTransitions("O2C", "sales-order", "Allocated").map((item: { action: string }) => item.action);

  assert.deepEqual(poActions, ["receive"]);
  assert.ok(soActions.includes("ship"));
  assert.ok(soActions.includes("cancel"));
});

test("replayEvents reconstructs O2C and R2R terminal paths", () => {
  const invoiceState = replayEvents("O2C", [
    makeLedgerEvent({ eventType: "O2C.ARInvoiceCreated", aggregateId: "AR-1", aggregateType: "ar-invoice", domain: "O2C", payload: { amount: 1500 } }),
    makeLedgerEvent({ eventType: "O2C.ARInvoicePosted", aggregateId: "AR-1", aggregateType: "ar-invoice", domain: "O2C" }),
    makeLedgerEvent({ eventType: "O2C.ARInvoiceWrittenOff", aggregateId: "AR-1", aggregateType: "ar-invoice", domain: "O2C" })
  ]);

  const periodState = replayEvents("R2R", [
    makeLedgerEvent({ eventType: "R2R.PeriodOpened", aggregateId: "PER-1", aggregateType: "period", domain: "R2R" }),
    makeLedgerEvent({ eventType: "R2R.PeriodCloseBegun", aggregateId: "PER-1", aggregateType: "period", domain: "R2R" }),
    makeLedgerEvent({ eventType: "R2R.PeriodClosed", aggregateId: "PER-1", aggregateType: "period", domain: "R2R" }),
    makeLedgerEvent({ eventType: "R2R.PeriodReopened", aggregateId: "PER-1", aggregateType: "period", domain: "R2R" })
  ]);

  assert.equal(invoiceState?.state, "WrittenOff");
  assert.equal(invoiceState?.attributes.amount, 1500);
  assert.equal(periodState?.state, "Reopened");
  assert.equal(periodState?.version, 4);
});

test("evaluateTransition stops at authority deny and never calls governance", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    if (url.includes("/authority/check")) {
      return jsonResponse({ allowed: false, reasons: ["not-authorized"] });
    }

    return jsonResponse({ allowed: true, requiresApproval: false, violations: [], constraints: [], matchedRules: [] });
  }) as typeof fetch;

  const result = await evaluateTransition({
    actorId: "EMP-401",
    action: "approve",
    domain: "P2P",
    aggregate: {
      id: "REQ-401",
      domain: "P2P",
      aggregateType: "requisition",
      state: "Submitted",
      attributes: { requesterId: "EMP-401", amount: 500 },
      version: 2
    },
    payload: {}
  });

  globalThis.fetch = originalFetch;

  assert.deepEqual(result, { kind: "denied", reasons: ["not-authorized"] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.includes("/authority/check"));
});

test("evaluateTransition returns requiresApproval when governance escalates", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    bodies.push(body);

    if (url.includes("/authority/check")) {
      return jsonResponse({ allowed: true, effectiveTier: 2, requiredTier: 1, reasons: [] });
    }

    return jsonResponse({
      allowed: true,
      requiresApproval: true,
      requiredApproverTier: 4,
      violations: [],
      constraints: ["high-value"],
      matchedRules: ["RULE-1"]
    });
  }) as typeof fetch;

  const result = await evaluateTransition({
    actorId: "EMP-402",
    action: "approve",
    domain: "O2C",
    aggregate: {
      id: "SO-402",
      domain: "O2C",
      aggregateType: "sales-order",
      state: "Confirmed",
      attributes: { amount: 75000, customerRisk: "high", credentialType: "SOX" },
      version: 2
    },
    payload: {}
  });

  globalThis.fetch = originalFetch;

  const governanceRequest = bodies[1] as { context?: Record<string, unknown> } | undefined;

  assert.equal(result.kind, "requiresApproval");
  assert.equal(result.requiredTier, 4);
  assert.deepEqual(result.reasons, ["high-value"]);
  assert.equal(governanceRequest?.context?.customerRisk, "high");
  assert.equal(governanceRequest?.context?.amount, 75000);
});

test("evaluateTransition returns allowed and maps H2R governance context correctly", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    bodies.push(body);

    if (url.includes("/authority/check")) {
      return jsonResponse({ allowed: true, effectiveTier: 3, requiredTier: 2, reasons: [] });
    }

    return jsonResponse({
      allowed: true,
      requiresApproval: false,
      violations: [],
      constraints: [],
      matchedRules: []
    });
  }) as typeof fetch;

  const result = await evaluateTransition({
    actorId: "EMP-403",
    action: "activate",
    domain: "H2R",
    aggregate: {
      id: "EMP-900",
      domain: "H2R",
      aggregateType: "employee",
      state: "Onboarding",
      attributes: { credentialType: "HR-ADMIN" },
      version: 2
    },
    payload: {}
  });

  globalThis.fetch = originalFetch;

  const authorityRequest = bodies[0] as { context?: Record<string, unknown> } | undefined;
  const governanceRequest = bodies[1] as { context?: Record<string, unknown> } | undefined;

  assert.deepEqual(result, { kind: "allowed", effectiveTier: 3 });
  assert.equal(authorityRequest?.context?.employeeId, "EMP-900");
  assert.equal(governanceRequest?.context?.employeeId, "EMP-900");
  assert.equal(governanceRequest?.context?.credentialType, "HR-ADMIN");
});