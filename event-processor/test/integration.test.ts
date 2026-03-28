import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import request from "supertest";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-processor-test-"));
process.env.API_KEY = "test-key";
process.env.DATABASE_PATH = path.join(tempDir, "event-processor.test.db");
process.env.FOUNDATION_ERP_API_KEY = "test-key";
process.env.MESH_GATEWAY_API_KEY = "test-key";
process.env.AUTHORITY_ENGINE_API_KEY = "test-key";
process.env.GOVERNANCE_ENGINE_API_KEY = "test-key";

const { runMigrations } = require("../src/db/migrate");
const { appendCanonicalEvent, listLedgerEvents } = require("../src/domain/ledgerStore");
const { upsertSourceCursor } = require("../src/domain/sourceCursorStore");
const { createApp } = require("../src/app");
const { setReplayStatus } = require("../src/projection/runtimeState");

runMigrations();

test("deduplicates by source triplet", () => {
  const sampleEvent = {
    eventId: "TEST-EVT-1",
    eventType: "P2P.PurchaseOrderIssued",
    eventVersion: 1,
    occurredAt: "2026-03-27T12:00:00.000Z",
    source: {
      system: "foundation-erp" as const,
      streamId: "foundation-event-1",
      sequence: 0
    },
    correlation: {},
    actor: {
      impersonated: false
    },
    domain: {
      domain: "P2P",
      aggregateType: "purchase-order",
      aggregateId: "PO-001"
    },
    payload: {
      id: "PO-001"
    },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", "P2P"],
      flags: {
        isReplay: false,
        isSynthetic: false
      }
    }
  };

  assert.equal(appendCanonicalEvent(sampleEvent), true);
  assert.equal(appendCanonicalEvent({ ...sampleEvent, eventId: "TEST-EVT-2" }), false);

  const rows = listLedgerEvents({ sourceSystem: "foundation-erp" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.eventId, "TEST-EVT-1");
});

test("exposes ingestion status and aggregate replay APIs", async () => {
  setReplayStatus("Ready");
  const app = createApp();

  const statusResponse = await request(app)
    .get("/api/v1/status/ingestion")
    .set("x-api-key", "test-key")
    .expect(200);

  assert.equal(statusResponse.body.status, "Ready");
  assert.equal(typeof statusResponse.body.ledgerEventCount, "number");

  const replayResponse = await request(app)
    .get("/api/v1/replay/aggregate")
    .query({ domain: "P2P", aggregateType: "purchase-order", aggregateId: "PO-001" })
    .set("x-api-key", "test-key")
    .expect(200);

  assert.equal(replayResponse.body.data.length, 1);
  assert.equal(replayResponse.body.data[0].eventType, "P2P.PurchaseOrderIssued");
});

test("filters event queries by aggregate selectors", async () => {
  const aggregateId = `PO-Q-${Date.now()}`;

  appendCanonicalEvent({
    eventId: `${aggregateId}-1`,
    eventType: "P2P.PurchaseOrderCreated",
    eventVersion: 1,
    occurredAt: "2026-03-27T12:05:00.000Z",
    source: { system: "foundation-erp", streamId: aggregateId, sequence: 1 },
    correlation: {},
    actor: { impersonated: false },
    domain: { domain: "P2P", aggregateType: "purchase-order", aggregateId },
    payload: { id: aggregateId },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", "P2P"],
      flags: { isReplay: false, isSynthetic: false }
    }
  });

  appendCanonicalEvent({
    eventId: `${aggregateId}-2`,
    eventType: "P2P.PurchaseOrderIssued",
    eventVersion: 1,
    occurredAt: "2026-03-27T12:06:00.000Z",
    source: { system: "foundation-erp", streamId: aggregateId, sequence: 2 },
    correlation: {},
    actor: { impersonated: false },
    domain: { domain: "P2P", aggregateType: "purchase-order", aggregateId },
    payload: { id: aggregateId },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", "P2P"],
      flags: { isReplay: false, isSynthetic: false }
    }
  });

  appendCanonicalEvent({
    eventId: `${aggregateId}-other`,
    eventType: "O2C.QuoteCreated",
    eventVersion: 1,
    occurredAt: "2026-03-27T12:07:00.000Z",
    source: { system: "foundation-erp", streamId: `${aggregateId}-other`, sequence: 1 },
    correlation: {},
    actor: { impersonated: false },
    domain: { domain: "O2C", aggregateType: "quote", aggregateId: `${aggregateId}-other` },
    payload: { id: `${aggregateId}-other` },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", "O2C"],
      flags: { isReplay: false, isSynthetic: false }
    }
  });

  const app = createApp();
  const response = await request(app)
    .get("/api/v1/events")
    .query({ domain: "P2P", aggregateType: "purchase-order", aggregateId, limit: 10 })
    .set("x-api-key", "test-key")
    .expect(200);

  assert.equal(response.body.data.length, 2);
  assert.equal(response.body.data[0].domain.aggregateId, aggregateId);
  assert.equal(response.body.data[1].eventType, "P2P.PurchaseOrderIssued");
});

test("status endpoint returns source cursor rows", async () => {
  upsertSourceCursor({
    sourceSystem: "authority-engine",
    cursor: "2026-03-27T13:00:00.000Z",
    lastEventAt: "2026-03-27T13:00:00.000Z",
    lastStatus: "Ready"
  });

  const app = createApp();
  const response = await request(app)
    .get("/api/v1/status/ingestion")
    .set("x-api-key", "test-key")
    .expect(200);

  assert.ok(response.body.sources.some((source: { sourceSystem: string }) => source.sourceSystem === "authority-engine"));
});

test("readiness gate blocks event queries until replay is ready", async () => {
  setReplayStatus("Replaying");

  const app = createApp();
  const response = await request(app)
    .get("/api/v1/events")
    .set("x-api-key", "test-key")
    .expect(503);

  assert.equal(response.body.code, "replay_not_ready");
  assert.equal(response.body.status, "Replaying");

  setReplayStatus("Ready");
});