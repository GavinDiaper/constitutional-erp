import test from "node:test";
import assert from "node:assert/strict";
import { McpCatalog } from "../domain/mcpCatalog";
import { serializeMcpFunction } from "./hub.routes";

test("serializeMcpFunction preserves display entity instead of aggregate type", () => {
  const catalog = new McpCatalog("mesh-adapter");
  const invoiceFn = catalog.list().find((entry) => entry.id === "o2c_post_invoice");

  assert.ok(invoiceFn, "expected o2c_post_invoice catalog entry");

  const serialized = serializeMcpFunction(invoiceFn);

  assert.equal(serialized.entity, "ArInvoice");
  assert.notEqual(serialized.entity, invoiceFn.aggregateType);
});