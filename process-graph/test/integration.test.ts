import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import request from "supertest";

// ── Test environment setup ────────────────────────────────────────────────────
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "process-graph-test-"));
process.env.API_KEY = "test-key";
process.env.DATABASE_PATH = path.join(tempDir, "process-graph.test.db");
process.env.EVENT_PROCESSOR_API_KEY = "test-key";
process.env.AUTHORITY_ENGINE_API_KEY = "test-key";
process.env.GOVERNANCE_ENGINE_API_KEY = "test-key";
process.env.MESH_GATEWAY_API_KEY = "test-key";
process.env.MESH_DELEGATION_ENABLED = "false";

const { runMigrations } = require("../src/db/migrate");
const { createApp } = require("../src/app");
const { setReplayStatus } = require("../src/projection/runtimeState");
const { getAvailableTransitions, findTransition, isKnownAggregateType } = require("../src/domain/transitions/registry");
const { replayEvents } = require("../src/domain/reducers/registry");
const { createApprovalTask, getApprovalTask, listPendingApprovalTasks, appendCommandLog } = require("../src/domain/commandStore");

runMigrations();
setReplayStatus("Ready");

type ExternalMockConfig = {
  ledgerEvents?: unknown[];
  authorityResponse?: Record<string, unknown>;
  governanceResponse?: Record<string, unknown>;
  meshStatus?: number;
  meshBody?: Record<string, unknown>;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function installExternalFetchMock(config: ExternalMockConfig = {}): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/api/v1/replay/aggregate")) {
      return jsonResponse(200, { data: config.ledgerEvents ?? [] });
    }

    if (url.includes("/authority/check")) {
      return jsonResponse(
        200,
        config.authorityResponse ?? {
          allowed: true,
          effectiveTier: 2,
          requiredTier: 1,
          reasons: []
        }
      );
    }

    if (url.includes("/governance/evaluate")) {
      return jsonResponse(
        200,
        config.governanceResponse ?? {
          allowed: true,
          requiresApproval: false,
          requiredApproverTier: null,
          violations: [],
          constraints: [],
          matchedRules: []
        }
      );
    }

    if (url.includes("/mesh/")) {
      return jsonResponse(config.meshStatus ?? 200, config.meshBody ?? { delegated: true });
    }

    return new Response(`Unexpected test fetch URL: ${url}`, { status: 500 });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

// ── Transition registry unit tests ────────────────────────────────────────────
test("isKnownAggregateType returns true for all registered P2P aggregates", () => {
  assert.equal(isKnownAggregateType("P2P", "requisition"), true);
  assert.equal(isKnownAggregateType("P2P", "purchase-order"), true);
  assert.equal(isKnownAggregateType("P2P", "supplier-invoice"), true);
  assert.equal(isKnownAggregateType("P2P", "ap-payment"), true);
});

test("isKnownAggregateType returns true for O2C, R2R, H2R aggregates", () => {
  assert.equal(isKnownAggregateType("O2C", "quote"), true);
  assert.equal(isKnownAggregateType("O2C", "sales-order"), true);
  assert.equal(isKnownAggregateType("R2R", "journal"), true);
  assert.equal(isKnownAggregateType("R2R", "fiscal-period"), true);
  assert.equal(isKnownAggregateType("H2R", "employee"), true);
  assert.equal(isKnownAggregateType("H2R", "leave-request"), true);
});

test("isKnownAggregateType returns false for unknown types", () => {
  assert.equal(isKnownAggregateType("P2P", "invoice"), false);
  assert.equal(isKnownAggregateType("P2P", "unknown"), false);
});

test("getAvailableTransitions returns correct actions for P2P requisition in Draft", () => {
  const transitions = getAvailableTransitions("P2P", "requisition", "Draft");
  const actions = transitions.map((t: { action: string }) => t.action).sort();
  assert.deepEqual(actions, ["cancel", "submit"]);
});

test("getAvailableTransitions returns no transitions for terminal state", () => {
  const cancelled = getAvailableTransitions("P2P", "requisition", "Cancelled");
  assert.equal(cancelled.length, 0);
  const converted = getAvailableTransitions("P2P", "requisition", "ConvertedToPO");
  assert.equal(converted.length, 0);
});

test("findTransition resolves P2P purchase-order receive from Issued", () => {
  const t = findTransition("P2P", "purchase-order", "receive");
  assert.ok(t);
  assert.equal(t.action, "receive");
  assert.ok(t.fromStates.includes("Issued"));
  assert.ok(t.fromStates.includes("Acknowledged"));
  assert.ok(t.toStates.includes("PartiallyReceived"));
  assert.ok(t.toStates.includes("FullyReceived"));
});

// ── Reducer / replay unit tests ───────────────────────────────────────────────
function makeLedgerEvent(overrides: {
  eventId?: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  domain: string;
  payload?: Record<string, unknown>;
}) {
  return {
    eventId: overrides.eventId ?? `EVT-${Date.now()}`,
    eventType: overrides.eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    source: { system: "foundation-erp", streamId: "s-1", sequence: 1 },
    correlation: {},
    actor: { impersonated: false },
    domain: {
      domain: overrides.domain,
      aggregateType: overrides.aggregateType,
      aggregateId: overrides.aggregateId
    },
    payload: overrides.payload ?? {},
    metadata: { schemaVersion: 1, tags: [], flags: { isReplay: false, isSynthetic: false } }
  };
}

test("replayEvents returns null for empty event stream", () => {
  const result = replayEvents("P2P", []);
  assert.equal(result, null);
});

test("replayEvents reconstructs P2P requisition from two events", () => {
  const events = [
    makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-1", amount: 500 } }),
    makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-1", aggregateType: "requisition", domain: "P2P" })
  ];

  const state = replayEvents("P2P", events);
  assert.ok(state);
  assert.equal(state.state, "Submitted");
  assert.equal(state.id, "REQ-1");
  assert.equal(state.version, 2);
  assert.equal(state.attributes.amount, 500);
});

test("replayEvents reconstructs P2P purchase-order through receive to FullyReceived", () => {
  const events = [
    makeLedgerEvent({ eventType: "P2P.PurchaseOrderCreated", aggregateId: "PO-1", aggregateType: "purchase-order", domain: "P2P", payload: { supplierId: "SUP-1", totalAmount: 1000 } }),
    makeLedgerEvent({ eventType: "P2P.PurchaseOrderIssued", aggregateId: "PO-1", aggregateType: "purchase-order", domain: "P2P" }),
    makeLedgerEvent({ eventType: "P2P.PurchaseOrderFullyReceived", aggregateId: "PO-1", aggregateType: "purchase-order", domain: "P2P" })
  ];

  const state = replayEvents("P2P", events);
  assert.ok(state);
  assert.equal(state.state, "FullyReceived");
  assert.equal(state.version, 3);
});

test("replayEvents reconstructs H2R employee through onboard and activate", () => {
  const events = [
    makeLedgerEvent({ eventType: "H2R.EmployeeCandidateCreated", aggregateId: "EMP-1", aggregateType: "employee", domain: "H2R" }),
    makeLedgerEvent({ eventType: "H2R.EmployeeOnboarded", aggregateId: "EMP-1", aggregateType: "employee", domain: "H2R" }),
    makeLedgerEvent({ eventType: "H2R.EmployeeActivated", aggregateId: "EMP-1", aggregateType: "employee", domain: "H2R" })
  ];

  const state = replayEvents("H2R", events);
  assert.ok(state);
  assert.equal(state.state, "Active");
});

// ── Command store unit tests ──────────────────────────────────────────────────
test("createApprovalTask persists and retrieves a pending task", () => {
  const task = createApprovalTask({
    domain: "P2P",
    aggregateType: "purchase-order",
    aggregateId: "PO-TASK-1",
    action: "cancel",
    actorId: "EMP-10",
    payload: {},
    requiredApproverTier: 3,
    status: "Pending"
  });

  assert.ok(task.id);
  assert.equal(task.status, "Pending");

  const retrieved = getApprovalTask(task.id);
  assert.ok(retrieved);
  assert.equal(retrieved.aggregateId, "PO-TASK-1");
  assert.equal(retrieved.requiredApproverTier, 3);
});

test("listPendingApprovalTasks returns tasks filtered by domain", () => {
  createApprovalTask({
    domain: "O2C",
    aggregateType: "sales-order",
    aggregateId: "SO-1",
    action: "cancel",
    actorId: "EMP-11",
    payload: {},
    requiredApproverTier: 2,
    status: "Pending"
  });

  const p2pTasks = listPendingApprovalTasks({ domain: "P2P" });
  const o2cTasks = listPendingApprovalTasks({ domain: "O2C" });

  // P2P tasks from the previous test should be present
  assert.ok(p2pTasks.every((t: { domain: string }) => t.domain === "P2P"));
  assert.ok(o2cTasks.some((t: { aggregateId: string }) => t.aggregateId === "SO-1"));
});

test("appendCommandLog records a command entry", () => {
  const entry = appendCommandLog({
    domain: "P2P",
    aggregateType: "requisition",
    aggregateId: "REQ-CMD-1",
    action: "submit",
    actorId: "EMP-20",
    projectedState: "Submitted",
    payload: {},
    meshDelegated: false
  });

  assert.ok(entry.id);
  assert.equal(entry.projectedState, "Submitted");
  assert.equal(entry.meshDelegated, false);
});

// ── HTTP API tests ────────────────────────────────────────────────────────────
test("GET /health returns ok when ready", async () => {
  const app = createApp();
  const res = await request(app).get("/health").expect(200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "process-graph");
});

test("GET /graph without API key returns 401", async () => {
  const app = createApp();
  await request(app)
    .get("/graph/p2p/requisition/REQ-NO-KEY")
    .expect(401);
});

test("GET /graph/:domain/:aggregateType/:id returns 400 for unknown aggregateType", async () => {
  const restoreFetch = installExternalFetchMock({ ledgerEvents: [] });

  const app = createApp();
  const res = await request(app)
    .get("/graph/p2p/unknown-type/ID-1")
    .set("x-api-key", "test-key")
    .expect(400);

  assert.ok(res.body.title);
  restoreFetch();
});

test("GET /graph/:domain/:aggregateType/:id returns 404 when no events exist", async () => {
  const restoreFetch = installExternalFetchMock({ ledgerEvents: [] });

  const app = createApp();
  await request(app)
    .get("/graph/p2p/requisition/REQ-NONE")
    .set("x-api-key", "test-key")
    .expect(404);

  restoreFetch();
});

test("GET /graph/:domain/:aggregateType/:id returns canonical resource when events exist", async () => {
  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-GET-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-1", amount: 250 } })
    ]
  });

  const app = createApp();
  const res = await request(app)
    .get("/graph/p2p/requisition/REQ-GET-1")
    .set("x-api-key", "test-key")
    .expect(200);

  assert.equal(res.body.id, "REQ-GET-1");
  assert.equal(res.body.domain, "P2P");
  assert.equal(res.body.state, "Draft");
  assert.ok(res.body.links["self"]);
  // Both 'submit' and 'cancel' should be available from Draft (no actor = unfiltered)
  assert.ok(res.body.links["submit"]);
  assert.ok(res.body.links["cancel"]);

  restoreFetch();
});

test("POST /graph/:domain/:aggregateType/:id/:action returns 400 when x-actor-id missing", async () => {
  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-POST-1", aggregateType: "requisition", domain: "P2P" })
    ]
  });

  const app = createApp();
  await request(app)
    .post("/graph/p2p/requisition/REQ-POST-1/submit")
    .set("x-api-key", "test-key")
    .send({})
    .expect(400);

  restoreFetch();
});

test("POST /graph/:domain/:aggregateType/:id/:action returns 422 for invalid transition from current state", async () => {
  const restoreFetch = installExternalFetchMock({
    // Requisition is already Approved; submit is invalid from this state.
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-INV-1", aggregateType: "requisition", domain: "P2P" }),
      makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-INV-1", aggregateType: "requisition", domain: "P2P" }),
      makeLedgerEvent({ eventType: "P2P.RequisitionApproved", aggregateId: "REQ-INV-1", aggregateType: "requisition", domain: "P2P" })
    ]
  });

  const app = createApp();
  await request(app)
    .post("/graph/p2p/requisition/REQ-INV-1/submit")
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-1")
    .send({})
    .expect(422);

  restoreFetch();
});

test("POST transition returns 403 when authority check denies", async () => {
  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-DENY-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-2", amount: 100 } }),
      makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-DENY-1", aggregateType: "requisition", domain: "P2P" })
    ],
    authorityResponse: {
      allowed: false,
      effectiveTier: 0,
      requiredTier: 1,
      reasons: ["Actor has no active authority tier in P2P"]
    }
  });

  const app = createApp();
  const res = await request(app)
    .post("/graph/p2p/requisition/REQ-DENY-1/approve")
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-99")
    .send({ amount: 100 })
    .expect(403);

  assert.equal(res.body.title, "transition_denied");

  restoreFetch();
});

test("POST transition returns 202 when governance requires approval", async () => {
  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-APPROV-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-3", amount: 75000 } }),
      makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-APPROV-1", aggregateType: "requisition", domain: "P2P" })
    ],
    authorityResponse: { allowed: true, effectiveTier: 2, requiredTier: 1, reasons: [] },
    governanceResponse: {
      allowed: true,
      requiresApproval: true,
      requiredApproverTier: 4,
      violations: [],
      constraints: ["Amount exceeds high-value threshold"],
      matchedRules: ["RULE-HV-001"]
    }
  });

  const app = createApp();
  const res = await request(app)
    .post("/graph/p2p/requisition/REQ-APPROV-1/approve")
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-3")
    .send({ amount: 75000 })
    .expect(202);

  assert.equal(res.body.status, "approval_required");
  assert.ok(res.body.approvalTask.id);
  assert.equal(res.body.approvalTask.requiredTier, 4);

  restoreFetch();
});

test("POST allowed transition returns projected canonical resource", async () => {
  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-ALLOW-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-4", amount: 100 } })
    ],
    authorityResponse: { allowed: true, effectiveTier: 2, requiredTier: 1, reasons: [] },
    governanceResponse: {
      allowed: true,
      requiresApproval: false,
      violations: [],
      constraints: [],
      matchedRules: []
    }
  });

  const app = createApp();
  const res = await request(app)
    .post("/graph/p2p/requisition/REQ-ALLOW-1/submit")
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-4")
    .send({})
    .expect(200);

  assert.equal(res.body.id, "REQ-ALLOW-1");
  assert.equal(res.body.state, "Submitted");
  // Next canonical transitions from Submitted should be in links
  assert.ok(res.body.links["approve"] || res.body.links["reject"] || res.body.links["cancel"]);

  restoreFetch();
});

test("GET /graph/approvals returns pending tasks", async () => {
  const app = createApp();
  const res = await request(app)
    .get("/graph/approvals")
    .set("x-api-key", "test-key")
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
});

test("GET /graph with actorId annotates approval-required links", async () => {
  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-LINK-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-5", amount: 95000 } })
    ],
    authorityResponse: { allowed: true, effectiveTier: 2, requiredTier: 1, reasons: [] },
    governanceResponse: {
      allowed: true,
      requiresApproval: true,
      requiredApproverTier: 5,
      violations: [],
      constraints: ["executive approval"],
      matchedRules: ["RULE-EXEC-1"]
    }
  });

  const app = createApp();
  const res = await request(app)
    .get("/graph/p2p/requisition/REQ-LINK-1")
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-5")
    .expect(200);

  restoreFetch();

  assert.equal(res.body.links.submit.requiresApproval, true);
  assert.equal(res.body.links.submit.requiredTier, 5);
  assert.equal(res.body.links.cancel.requiresApproval, true);
});

test("POST /graph/approvals/:taskId/resolve approves and executes a task", async () => {
  const task = createApprovalTask({
    domain: "P2P",
    aggregateType: "requisition",
    aggregateId: "REQ-RESOLVE-1",
    action: "approve",
    actorId: "EMP-6",
    payload: { amount: 1000 },
    requiredApproverTier: 3,
    status: "Pending"
  });

  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-RESOLVE-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-6", amount: 1000 } }),
      makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-RESOLVE-1", aggregateType: "requisition", domain: "P2P" })
    ],
    authorityResponse: { allowed: true, effectiveTier: 4, requiredTier: 3, reasons: [] },
    governanceResponse: {
      allowed: true,
      requiresApproval: false,
      violations: [],
      constraints: [],
      matchedRules: []
    }
  });

  const app = createApp();
  const res = await request(app)
    .post(`/graph/approvals/${task.id}/resolve`)
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-APPROVER")
    .send({ resolution: "Approved", note: "approved in integration test" })
    .expect(200);

  restoreFetch();

  assert.equal(res.body.status, "approved_and_executed");
  assert.equal(res.body.resource.state, "Approved");
  assert.equal(res.body.task.status, "Approved");
});

test("POST /graph/approvals/:taskId/resolve returns stale_approval when state changed", async () => {
  const task = createApprovalTask({
    domain: "P2P",
    aggregateType: "requisition",
    aggregateId: "REQ-STALE-1",
    action: "approve",
    actorId: "EMP-7",
    payload: { amount: 4000 },
    requiredApproverTier: 2,
    status: "Pending"
  });

  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-STALE-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-7", amount: 4000 } }),
      makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-STALE-1", aggregateType: "requisition", domain: "P2P" }),
      makeLedgerEvent({ eventType: "P2P.RequisitionApproved", aggregateId: "REQ-STALE-1", aggregateType: "requisition", domain: "P2P" })
    ]
  });

  const app = createApp();
  const res = await request(app)
    .post(`/graph/approvals/${task.id}/resolve`)
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-APPROVER-STALE")
    .send({ resolution: "Approved", note: "stale path" })
    .expect(409);

  restoreFetch();

  assert.equal(res.body.title, "stale_approval");
  assert.equal(res.body.task.status, "Approved");
});

test("POST /graph/approvals/:taskId/resolve rejects already-resolved tasks", async () => {
  const task = createApprovalTask({
    domain: "P2P",
    aggregateType: "requisition",
    aggregateId: "REQ-DOUBLE-1",
    action: "approve",
    actorId: "EMP-8",
    payload: { amount: 2500 },
    requiredApproverTier: 2,
    status: "Pending"
  });

  const restoreFetch = installExternalFetchMock({
    ledgerEvents: [
      makeLedgerEvent({ eventType: "P2P.RequisitionCreated", aggregateId: "REQ-DOUBLE-1", aggregateType: "requisition", domain: "P2P", payload: { requesterId: "EMP-8", amount: 2500 } }),
      makeLedgerEvent({ eventType: "P2P.RequisitionSubmitted", aggregateId: "REQ-DOUBLE-1", aggregateType: "requisition", domain: "P2P" })
    ],
    authorityResponse: { allowed: true, effectiveTier: 4, requiredTier: 2, reasons: [] },
    governanceResponse: {
      allowed: true,
      requiresApproval: false,
      violations: [],
      constraints: [],
      matchedRules: []
    }
  });

  const app = createApp();
  await request(app)
    .post(`/graph/approvals/${task.id}/resolve`)
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-APPROVER-DOUBLE")
    .send({ resolution: "Approved" })
    .expect(200);

  const second = await request(app)
    .post(`/graph/approvals/${task.id}/resolve`)
    .set("x-api-key", "test-key")
    .set("x-actor-id", "EMP-APPROVER-DOUBLE")
    .send({ resolution: "Approved" })
    .expect(409);

  restoreFetch();

  assert.equal(second.body.title, "approval_task_already_resolved");
});
