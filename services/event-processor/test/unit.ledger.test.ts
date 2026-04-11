import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-processor-ledger-"));
process.env.API_KEY = "test-key";
process.env.DATABASE_PATH = path.join(tempDir, "event-processor.ledger.db");
process.env.FOUNDATION_ERP_API_KEY = "test-key";
process.env.MESH_GATEWAY_API_KEY = "test-key";
process.env.AUTHORITY_ENGINE_API_KEY = "test-key";
process.env.GOVERNANCE_ENGINE_API_KEY = "test-key";

const { runMigrations } = require("../src/db/migrate");
const { db } = require("../src/db/connection");
const {
  appendCanonicalEvent,
  countLedgerEvents,
  getAggregateStream,
  listLedgerEvents,
  recordDeadLetter
} = require("../src/domain/ledgerStore");
const { getSourceCursor, listSourceCursors, upsertSourceCursor } = require("../src/domain/sourceCursorStore");

runMigrations();

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  const eventId = String(overrides.eventId ?? `LEDGER-${Date.now()}-${Math.random()}`);
  const aggregateId = String(overrides.aggregateId ?? `REQ-${Date.now()}`);
  const occurredAt = String(overrides.occurredAt ?? "2026-03-27T12:00:00.000Z");

  return {
    eventId,
    eventType: String(overrides.eventType ?? "P2P.RequisitionCreated"),
    eventVersion: Number(overrides.eventVersion ?? 1),
    occurredAt,
    source: {
      system: (overrides.sourceSystem ?? "foundation-erp") as "foundation-erp",
      streamId: String(overrides.streamId ?? eventId),
      sequence: Number(overrides.sequence ?? 0)
    },
    correlation: {
      correlationId: overrides.correlationId as string | undefined,
      causationId: overrides.causationId as string | undefined
    },
    actor: {
      actorId: overrides.actorId as string | undefined,
      ingressId: "foundation-ingress",
      impersonated: false
    },
    domain: {
      domain: String(overrides.domain ?? "P2P"),
      aggregateType: String(overrides.aggregateType ?? "requisition"),
      aggregateId,
      tenantId: overrides.tenantId as string | undefined
    },
    payload: { amount: overrides.amount ?? 100 },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", String(overrides.domain ?? "P2P")],
      flags: { isReplay: false, isSynthetic: false }
    }
  };
}

test("listLedgerEvents filters by domain and aggregate identifiers", () => {
  const aggregateId = `REQ-FILTER-${Date.now()}`;
  const beforeCount = countLedgerEvents();

  appendCanonicalEvent(makeEvent({ eventId: `${aggregateId}-1`, aggregateId, occurredAt: "2026-03-27T12:00:01.000Z" }));
  appendCanonicalEvent(makeEvent({ eventId: `${aggregateId}-2`, aggregateId, eventType: "P2P.RequisitionSubmitted", occurredAt: "2026-03-27T12:00:02.000Z", sequence: 1, streamId: aggregateId }));
  appendCanonicalEvent(makeEvent({ eventId: `${aggregateId}-OTHER`, aggregateId: `${aggregateId}-X`, domain: "O2C", aggregateType: "quote", eventType: "O2C.QuoteCreated", occurredAt: "2026-03-27T12:00:03.000Z" }));

  const filtered = listLedgerEvents({ domain: "P2P", aggregateType: "requisition", aggregateId, limit: 10 });
  const stream = getAggregateStream("P2P", "requisition", aggregateId);

  assert.equal(countLedgerEvents(), beforeCount + 3);
  assert.equal(filtered.length, 2);
  assert.equal(stream.length, 2);
  assert.equal(filtered[0].eventId, `${aggregateId}-1`);
  assert.equal(filtered[1].eventId, `${aggregateId}-2`);
});

test("recordDeadLetter persists failed rows for later inspection", () => {
  const sourceCursor = `cursor-${Date.now()}`;

  recordDeadLetter({
    sourceSystem: "mesh-gateway",
    sourceCursor,
    errorCode: "normalization_failed",
    errorDetail: "invalid resource",
    rawPayload: { id: 99, resource: null }
  });

  const row = db
    .prepare("SELECT source_system, source_cursor, error_code, error_detail FROM ledger_dead_letter WHERE source_cursor = ?")
    .get(sourceCursor) as { source_system: string; source_cursor: string; error_code: string; error_detail: string } | undefined;

  assert.ok(row);
  assert.equal(row?.source_system, "mesh-gateway");
  assert.equal(row?.error_code, "normalization_failed");
  assert.equal(row?.error_detail, "invalid resource");
});

test("source cursor store upserts and lists polling status", () => {
  const sourceSystem = "authority-engine";
  const first = getSourceCursor(sourceSystem);
  assert.equal(first, undefined);

  upsertSourceCursor({
    sourceSystem,
    cursor: "2026-03-27T12:30:00.000Z",
    lastEventAt: "2026-03-27T12:30:00.000Z",
    lastStatus: "Ready"
  });

  upsertSourceCursor({
    sourceSystem,
    cursor: "2026-03-27T12:35:00.000Z",
    lastEventAt: "2026-03-27T12:35:00.000Z",
    lastStatus: "Error",
    lastError: "timeout"
  });

  const cursor = getSourceCursor(sourceSystem);
  const all = listSourceCursors();

  assert.ok(cursor);
  assert.equal(cursor?.cursor, "2026-03-27T12:35:00.000Z");
  assert.equal(cursor?.lastStatus, "Error");
  assert.equal(cursor?.lastError, "timeout");
  assert.ok(all.some((entry: { sourceSystem: string }) => entry.sourceSystem === sourceSystem));
});