import test from "node:test";
import assert from "node:assert/strict";
import { McpCatalog } from "../domain/mcpCatalog";
import { HypermediaBuilder } from "../domain/hypermediaBuilder";
import { serializeMcpFunction } from "./hub.routes";

test("serializeMcpFunction preserves display entity instead of aggregate type", () => {
  const catalog = new McpCatalog("mesh-adapter");
  const invoiceFn = catalog.list().find((entry) => entry.id === "o2c_post_invoice");

  assert.ok(invoiceFn, "expected o2c_post_invoice catalog entry");

  const serialized = serializeMcpFunction(invoiceFn);

  assert.equal(serialized.entity, "ArInvoice");
  assert.notEqual(serialized.entity, invoiceFn.aggregateType);
});

test("supplier invoice catalog exposes typed contractor accrual matching and cancellation", () => {
  const catalog = new McpCatalog("mesh-adapter");
  const match = catalog.getByDomainAggregateAction("p2p", "supplier-invoice", "timesheet-accruals");
  const cancel = catalog.getByDomainAggregateAction("p2p", "supplier-invoice", "cancel");

  assert.ok(match);
  assert.equal(match?.operationType, "update");
  assert.equal(match?.backingRoute, "/mesh/mesh-adapter/p2p/supplier-invoice/{id}/timesheet-accruals");
  assert.deepEqual(match?.inputSchema.required, ["allocations"]);
  assert.equal(match?.inputSchema.properties?.allocations.type, "array");
  assert.ok(cancel);
  assert.equal(cancel?.operationType, "transition");
});

test("supplier invoice process exposes matching only before posting", () => {
  const catalog = new McpCatalog("mesh-adapter");
  const builder = new HypermediaBuilder(catalog, { annotate: () => ({ riskLevel: "High", requiredTier: 3 }) } as any);
  const resource = (state: string) => ({
    domain: "p2p",
    type: "supplier-invoice",
    state,
    attributes: {},
    links: {}
  }) as any;

  const draftLinks = builder.build({ entity: "SupplierInvoice", id: "APINV-1", resource: resource("Draft") });
  const postedLinks = builder.build({ entity: "SupplierInvoice", id: "APINV-1", resource: resource("Posted") });
  const matchLink = draftLinks.find((link) => link.rel === "timesheet-accruals");

  assert.ok(matchLink);
  assert.deepEqual(matchLink?.requiredInput.required, ["allocations"]);
  assert.ok(!postedLinks.some((link) => link.rel === "timesheet-accruals"));
});