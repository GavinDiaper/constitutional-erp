import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config/env";
import { setReplayStatus } from "../src/projection/state";
import { ensureTestDatabase, resetTestState } from "./testDb";

const app = createApp();
const apiKey = loadConfig().apiKey;

before(() => {
  ensureTestDatabase();
});

beforeEach(() => {
  resetTestState();
});

test("GET /health returns ok when replay is ready", async () => {
  setReplayStatus("Ready");

  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "governance-engine");
  assert.equal(response.body.replayStatus, "Ready");
  assert.equal(response.body.replayError, undefined);
});

test("GET /health returns degraded details when replay has failed", async () => {
  setReplayStatus("Failed", "Projection cursor mismatch");

  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "degraded");
  assert.equal(response.body.service, "governance-engine");
  assert.equal(response.body.replayStatus, "Failed");
  assert.equal(response.body.replayError, "Projection cursor mismatch");
});

test("POST /governance/evaluate rejects requests without API key", async () => {
  const response = await request(app).post("/governance/evaluate").send({});

  assert.equal(response.status, 401);
  assert.equal(response.body.title, "unauthorized");
  assert.match(String(response.body.detail), /api key/i);
});

test("POST /governance/evaluate is gated while replay is not ready", async () => {
  setReplayStatus("Replaying");

  const response = await request(app)
    .post("/governance/evaluate")
    .set("x-api-key", apiKey)
    .send({
      actorId: "EMP-10",
      action: "p2p_requisition_approved",
      domain: "P2P",
      context: {
        requesterId: "REQ-10",
        amount: 500
      },
      authorityDecision: {
        allowed: true,
        effectiveTier: 3,
        reasons: []
      }
    });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, "replay_not_ready");
  assert.equal(response.body.status, "Replaying");
});

test("POST /governance/evaluate returns 400 for invalid payloads", async () => {
  const response = await request(app)
    .post("/governance/evaluate")
    .set("x-api-key", apiKey)
    .send({
      actorId: "EMP-11",
      action: "p2p_purchase_order_issued",
      domain: "P2P",
      context: {
        requesterId: "REQ-11"
      },
      authorityDecision: {
        allowed: true,
        reasons: []
      }
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.title, "validation_error");
  assert.equal(response.body.status, 400);
  assert.ok(Array.isArray(response.body.errors));
});

test("POST /governance/evaluate returns governance decision payload", async () => {
  const response = await request(app)
    .post("/governance/evaluate")
    .set("x-api-key", apiKey)
    .send({
      actorId: "EMP-12",
      action: "p2p_purchase_order_issued",
      domain: "P2P",
      context: {
        requesterId: "REQ-12",
        amount: 20000,
        currency: "USD"
      },
      authorityDecision: {
        allowed: true,
        effectiveTier: 2,
        reasons: []
      }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.allowed, false);
  assert.equal(response.body.requiresApproval, true);
  assert.equal(response.body.requiredApproverTier, 3);
  assert.ok(response.body.constraints.includes("TierTooLowForThreshold"));
});

test("GET /api/v1/events returns emitted governance events", async () => {
  await request(app)
    .post("/governance/evaluate")
    .set("x-api-key", apiKey)
    .send({
      actorId: "EMP-13",
      action: "p2p_requisition_approved",
      domain: "P2P",
      context: {
        requesterId: "EMP-13",
        amount: 1000,
        currency: "USD"
      },
      authorityDecision: {
        allowed: true,
        effectiveTier: 4,
        reasons: []
      }
    })
    .expect(200);

  const response = await request(app).get("/api/v1/events?limit=10").set("x-api-key", apiKey);

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data));
  assert.ok(response.body.data.length >= 2);
  const eventTypes = response.body.data.map((row: { event_type: string }) => row.event_type);
  assert.ok(eventTypes.includes("GovernanceEvaluationPerformed"));
  assert.ok(eventTypes.includes("GovernanceViolationDetected"));
});
