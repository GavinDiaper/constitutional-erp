import assert from "node:assert/strict";
import test from "node:test";

const { deriveProjectCostingEvents } = require("../src/orchestration/projectCostingOrchestrator");

function makeBaseEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    eventId: String(overrides.eventId ?? "EVT-PROJ-1"),
    eventType: String(overrides.eventType ?? "proj.wip_material_posted"),
    eventVersion: 1,
    occurredAt: "2026-03-27T12:00:00.000Z",
    source: {
      system: "foundation-erp" as const,
      streamId: "S-1",
      sequence: 0
    },
    correlation: {
      correlationId: "CORR-1"
    },
    actor: {
      actorId: "EMP-1",
      impersonated: false
    },
    domain: {
      domain: "PROJ",
      aggregateType: "project-wip",
      aggregateId: "WIP-1",
      tenantId: "TEN-1"
    },
    payload: overrides.payload ?? {
      wipId: "WIP-1",
      projectId: "PRJ-1",
      totalCost: 125.5,
      inventoryIssueEventId: "MOV-1"
    },
    metadata: {
      schemaVersion: 1,
      tags: ["foundation-erp", "PROJ"],
      flags: {
        isReplay: false,
        isSynthetic: false
      }
    }
  };
}

test("derives SLA posting request from proj.wip_material_posted", () => {
  const derived = deriveProjectCostingEvents(makeBaseEvent());
  assert.equal(derived.length, 1);
  assert.equal(derived[0].eventType, "R2R.sla_posting_requested");
  assert.equal(derived[0].source.system, "event-processor");
  assert.equal(derived[0].payload.postingReason, "ProjectMaterialToWIP");
  assert.equal(derived[0].payload.amount, 125.5);
  assert.equal(derived[0].correlation.causationId, "EVT-PROJ-1");
});

test("derives SLA close request from proj.wip_closed", () => {
  const event = makeBaseEvent({
    eventId: "EVT-PROJ-CLOSE",
    eventType: "proj.wip_closed",
    payload: {
      wipId: "WIP-CLOSE",
      projectId: "PRJ-CLOSE",
      closureType: "FG_Conversion",
      finalTotalBalance: 900
    }
  });

  const derived = deriveProjectCostingEvents(event);
  assert.equal(derived.length, 1);
  assert.equal(derived[0].payload.postingReason, "ProjectWIPClose");
  assert.equal(derived[0].payload.debitAccountHint, "Inventory.FinishedGoods");
  assert.equal(derived[0].payload.creditAccountHint, "ProjectWIP.Total");
});

test("returns no derived events for unrelated event types", () => {
  const derived = deriveProjectCostingEvents(
    makeBaseEvent({
      eventType: "P2P.PurchaseOrderIssued"
    })
  );

  assert.equal(derived.length, 0);
});
