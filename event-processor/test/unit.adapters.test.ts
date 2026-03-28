import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-processor-unit-"));
process.env.API_KEY = "test-key";
process.env.DATABASE_PATH = path.join(tempDir, "event-processor.unit.db");
process.env.FOUNDATION_ERP_API_KEY = "test-key";
process.env.MESH_GATEWAY_API_KEY = "test-key";
process.env.AUTHORITY_ENGINE_API_KEY = "test-key";
process.env.GOVERNANCE_ENGINE_API_KEY = "test-key";

const { runMigrations } = require("../src/db/migrate");
const { foundationAdapter } = require("../src/adapters/foundationAdapter");
const { meshAdapter } = require("../src/adapters/meshAdapter");
const { authorityAdapter } = require("../src/adapters/authorityAdapter");
const { governanceAdapter } = require("../src/adapters/governanceAdapter");
const {
  asObject,
  defaultMetadata,
  domainFromEntityType,
  resourceParts,
  toCanonicalEngineEventType,
  toCanonicalMeshEventType,
  toKebabCase
} = require("../src/adapters/helpers");
const { canonicalEventSchema } = require("../src/contracts/canonicalSchemas");
const { applyUpcasters } = require("../src/contracts/upcasting");

runMigrations();

function makeEnvelope(sourceSystem: string, rawPayload: Record<string, unknown>) {
  return {
    sourceSystem,
    rawPayload,
    receivedAt: "2026-03-27T12:00:00.000Z"
  };
}

test("adapter helpers normalize common values", () => {
  assert.deepEqual(asObject('{"amount":100}'), { amount: 100 });
  assert.deepEqual(asObject({ amount: 200 }), { amount: 200 });
  assert.deepEqual(asObject(undefined), {});

  assert.equal(toKebabCase("PurchaseOrder"), "purchase-order");
  assert.equal(toCanonicalMeshEventType("MeshAllowed"), "Mesh.Allowed");
  assert.equal(toCanonicalMeshEventType("Denied"), "Mesh.Denied");
  assert.equal(toCanonicalEngineEventType("Authority", "AuthorityGranted"), "Authority.Granted");
  assert.equal(toCanonicalEngineEventType("Governance", "RuleMatched"), "Governance.RuleMatched");
  assert.equal(domainFromEntityType("PurchaseOrder"), "P2P");
  assert.equal(domainFromEntityType("UnknownThing", "CUSTOM"), "CUSTOM");
  assert.deepEqual(resourceParts("purchase-orders/PO-100"), {
    aggregateType: "purchase-order",
    aggregateId: "PO-100"
  });
  assert.deepEqual(resourceParts(), {
    aggregateType: "mesh-event",
    aggregateId: "unknown"
  });

  const metadata = defaultMetadata("foundation-erp", "P2P", ["Issued"]);
  assert.equal(metadata.schemaVersion, 1);
  assert.deepEqual(metadata.flags, { isReplay: false, isSynthetic: false });
  assert.deepEqual(metadata.tags, ["foundation-erp", "P2P", "Issued"]);
});

test("foundationAdapter normalizes ERP payload to canonical event", () => {
  const event = foundationAdapter.normalize(
    makeEnvelope("foundation-erp", {
      event_id: "FND-EVT-1",
      entity_type: "PurchaseOrder",
      entity_id: "PO-123",
      event_type: "Issued",
      timestamp: "2026-03-27T10:15:00.000Z",
      correlation_id: "CORR-1",
      causation_id: "CAUSE-1",
      payload: JSON.stringify({ actorId: "EMP-1", amount: 1000, tenantId: "TEN-1", currency: "GBP" })
    })
  );

  assert.equal(event.eventId, "FND-EVT-1");
  assert.equal(event.eventType, "P2P.Issued");
  assert.equal(event.source.system, "foundation-erp");
  assert.equal(event.domain.aggregateType, "purchase-order");
  assert.equal(event.domain.aggregateId, "PO-123");
  assert.equal(event.actor.actorId, "EMP-1");
  assert.equal(event.domain.tenantId, "TEN-1");
  assert.equal(event.payload.currency, "GBP");
});

test("meshAdapter normalizes mesh decision log rows", () => {
  const event = meshAdapter.normalize(
    makeEnvelope("mesh-gateway", {
      id: 42,
      created_at: "2026-03-27T10:20:00.000Z",
      event_type: "MeshAllowed",
      action: "issue",
      decision: "allow",
      reason: "policy_ok",
      domain: "P2P",
      resource: "purchase-orders/PO-42",
      actor_id: "EMP-2",
      payload_json: JSON.stringify({ correlationId: "CORR-42", tenantId: "TEN-42" })
    })
  );

  assert.equal(event.eventId, "MESH-42");
  assert.equal(event.eventType, "Mesh.Allowed");
  assert.equal(event.source.sequence, 42);
  assert.equal(event.domain.aggregateType, "purchase-order");
  assert.equal(event.domain.aggregateId, "PO-42");
  assert.equal(event.payload.action, "issue");
  assert.equal(event.payload.decision, "allow");
});

test("authority and governance adapters normalize engine events", () => {
  const authorityEvent = authorityAdapter.normalize(
    makeEnvelope("authority-engine", {
      event_id: "AUTH-EVT-1",
      event_type: "AuthorityGranted",
      entity_type: "PurchaseOrder",
      entity_id: "PO-9",
      timestamp: "2026-03-27T11:00:00.000Z",
      payload: { actorId: "EMP-3", domain: "P2P", impersonated: true }
    })
  );

  const governanceEvent = governanceAdapter.normalize(
    makeEnvelope("governance-engine", {
      event_id: "GOV-EVT-1",
      event_type: "RuleMatched",
      entity_type: "LeaveRequest",
      entity_id: "LR-9",
      timestamp: "2026-03-27T11:05:00.000Z",
      payload: { actorId: "EMP-4", domain: "H2R", tenantId: "TEN-99" }
    })
  );

  assert.equal(authorityEvent.eventType, "Authority.Granted");
  assert.equal(authorityEvent.domain.domain, "P2P");
  assert.equal(authorityEvent.actor.impersonated, true);

  assert.equal(governanceEvent.eventType, "Governance.RuleMatched");
  assert.equal(governanceEvent.domain.aggregateType, "leave-request");
  assert.equal(governanceEvent.domain.tenantId, "TEN-99");
});

test("canonicalEventSchema rejects invalid datetime payloads", () => {
  assert.throws(() =>
    canonicalEventSchema.parse({
      eventId: "EVT-BAD-1",
      eventType: "P2P.RequisitionCreated",
      eventVersion: 1,
      occurredAt: "not-a-datetime",
      source: { system: "foundation-erp", streamId: "S-1", sequence: 0 },
      correlation: {},
      actor: { impersonated: false },
      domain: { domain: "P2P", aggregateType: "requisition", aggregateId: "REQ-1" },
      payload: {},
      metadata: {
        schemaVersion: 1,
        tags: ["foundation-erp"],
        flags: { isReplay: false, isSynthetic: false }
      }
    })
  );
});

test("applyUpcasters applies a version chain until no matcher remains", () => {
  const input = {
    eventId: "EVT-UP-1",
    eventType: "P2P.RequisitionCreated",
    eventVersion: 1,
    occurredAt: "2026-03-27T12:00:00.000Z",
    source: { system: "foundation-erp", streamId: "S-1", sequence: 0 },
    correlation: {},
    actor: { impersonated: false },
    domain: { domain: "P2P", aggregateType: "requisition", aggregateId: "REQ-UP-1" },
    payload: { amount: 500 },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", "P2P"],
      flags: { isReplay: false, isSynthetic: false }
    }
  };

  const output = applyUpcasters(input, [
    {
      canUpcast(eventType: string, fromVersion: number) {
        return eventType === "P2P.RequisitionCreated" && fromVersion === 1;
      },
      upcast(event: typeof input) {
        return { ...event, eventVersion: 2, payload: { ...event.payload, stage: "v2" } };
      }
    },
    {
      canUpcast(eventType: string, fromVersion: number) {
        return eventType === "P2P.RequisitionCreated" && fromVersion === 2;
      },
      upcast(event: typeof input) {
        return { ...event, eventVersion: 3, payload: { ...event.payload, migrated: true } };
      }
    }
  ]);

  assert.equal(output.eventVersion, 3);
  assert.equal(output.payload.stage, "v2");
  assert.equal(output.payload.migrated, true);
});