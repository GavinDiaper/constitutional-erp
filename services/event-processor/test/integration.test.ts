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
const { getSourceCursor } = require("../src/domain/sourceCursorStore");
const { replayToHead } = require("../src/projection/replay");
const { db } = require("../src/db/connection");
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

test("ingest derives synthetic SLA event for project WIP material postings", async () => {
  setReplayStatus("Ready");
  const app = createApp();
  const baseEventId = `PROJ-WIP-${Date.now()}`;

  const ingestResponse = await request(app)
    .post("/api/v1/events/ingest")
    .set("x-api-key", "test-key")
    .send({
      events: [
        {
          eventId: baseEventId,
          eventType: "proj.wip_material_posted",
          eventVersion: 1,
          occurredAt: "2026-03-27T16:00:00.000Z",
          source: { system: "foundation-erp", streamId: `${baseEventId}-stream`, sequence: 0 },
          correlation: { correlationId: `${baseEventId}-corr` },
          actor: { actorId: "EMP-10", impersonated: false },
          domain: { domain: "PROJ", aggregateType: "project-wip", aggregateId: "WIP-10" },
          payload: {
            wipId: "WIP-10",
            projectId: "PRJ-10",
            totalCost: 321.45,
            inventoryIssueEventId: "MOV-10"
          },
          metadata: {
            schemaVersion: 1,
            tags: ["foundation-erp", "PROJ"],
            flags: { isReplay: false, isSynthetic: false }
          }
        }
      ]
    })
    .expect(202);

  assert.equal(ingestResponse.body.inserted, 2);
  assert.equal(ingestResponse.body.duplicates, 0);

  const replayResponse = await request(app)
    .get("/api/v1/events")
    .query({ aggregateType: "sla-posting", aggregateId: "WIP-10", limit: 10 })
    .set("x-api-key", "test-key")
    .expect(200);

  assert.equal(replayResponse.body.data.length, 1);
  assert.equal(replayResponse.body.data[0].eventType, "R2R.sla_posting_requested");
  assert.equal(replayResponse.body.data[0].source.system, "event-processor");
  assert.equal(replayResponse.body.data[0].payload.postingReason, "ProjectMaterialToWIP");
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

test("replayToHead appends valid events and records dead letters for invalid source rows", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push(url);

    if (url.includes("localhost:3000")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              event_id: "FND-REPLAY-1",
              entity_type: "PurchaseOrder",
              entity_id: "PO-REPLAY-1",
              event_type: "Issued",
              timestamp: "2026-03-27T14:00:00.000Z",
              payload: JSON.stringify({ actorId: "EMP-1", amount: 1200 })
            },
            {
              event_id: "FND-REPLAY-PROJ-1",
              entity_type: "ProjectWip",
              entity_id: "WIP-REPLAY-1",
              event_type: "proj.wip_material_posted",
              timestamp: "2026-03-27T14:05:00.000Z",
              payload: JSON.stringify({
                domain: "PROJ",
                actorId: "EMP-7",
                wipId: "WIP-REPLAY-1",
                projectId: "PRJ-REPLAY-1",
                totalCost: 88.5,
                inventoryIssueEventId: "INV-ISSUE-1"
              })
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes("localhost:4003")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 501,
              created_at: "not-a-datetime",
              event_type: "MeshAllowed",
              domain: "P2P",
              resource: "purchase-orders/PO-REPLAY-1",
              payload_json: JSON.stringify({ correlationId: "CORR-BAD" })
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  await replayToHead();

  globalThis.fetch = originalFetch;

  const foundationRows = listLedgerEvents({ aggregateId: "PO-REPLAY-1" });
  const slaRows = listLedgerEvents({ aggregateType: "sla-posting", aggregateId: "WIP-REPLAY-1" });
  const foundationCursor = getSourceCursor("foundation-erp");
  const meshCursor = getSourceCursor("mesh-gateway");
  const deadLetter = db
    .prepare("SELECT source_system, source_cursor, error_code FROM ledger_dead_letter WHERE source_system = 'mesh-gateway' ORDER BY id DESC LIMIT 1")
    .get() as { source_system: string; source_cursor: string; error_code: string } | undefined;

  assert.ok(requests.some((url) => url.includes("localhost:3000/api/v1/events")));
  assert.ok(requests.some((url) => url.includes("localhost:4003/api/v1/events")));
  assert.equal(foundationRows.some((row: { eventId: string }) => row.eventId === "FND-REPLAY-1"), true);
  assert.equal(slaRows.length, 1);
  assert.equal(slaRows[0]?.eventType, "R2R.sla_posting_requested");
  assert.equal(slaRows[0]?.payload.sourceEventType, "PROJ.proj.wip_material_posted");
  assert.equal(foundationCursor?.lastStatus, "Ready");
  assert.equal(foundationCursor?.cursor, "2026-03-27T14:05:00.000Z");
  assert.equal(meshCursor?.lastStatus, "Error");
  assert.equal(deadLetter?.source_system, "mesh-gateway");
  assert.equal(deadLetter?.error_code, "normalization_failed");
  assert.equal(deadLetter?.source_cursor, "not-a-datetime|501");
});