import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { z } from "zod";
import { mcpCatalog } from "../src/api/mcp/catalog";
import { mcpRegistry } from "../src/api/mcp/mcp.routes";
import { buildRegistry, inferKind } from "../src/api/mcp/registry";

test("registry exposes every catalog function with a handler each", () => {
  const registered = new Set(mcpRegistry.list().map((tool) => tool.name));
  const missing = mcpCatalog.map((fn) => fn.name).filter((name) => !registered.has(name));
  assert.deepEqual(missing, []);
  for (const tool of mcpRegistry.list()) {
    assert.equal(typeof tool.handler, "function", `${tool.name} has no handler`);
  }
});

test("every hypermedia mcpFunction link resolves to a registered tool", () => {
  const dir = path.join(__dirname, "../src/api/hypermedia");
  const referenced = new Set<string>();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    for (const match of fs.readFileSync(path.join(dir, file), "utf8").matchAll(/mcpFunction:\s*"([^"]+)"/g)) {
      referenced.add(match[1]);
    }
  }
  const missing = [...referenced].filter((name) => !mcpRegistry.get(name));
  assert.deepEqual(missing, []);
});

test("kind is inferred from the action and can be filtered", () => {
  assert.equal(inferKind("list"), "read");
  assert.equal(inferKind("get"), "read");
  assert.equal(inferKind("approve"), "write");
  assert.equal(mcpRegistry.get("proj_list_projects")?.kind, "read");
  assert.equal(mcpRegistry.get("p2p_approve_requisition")?.kind, "write");
  assert.ok(mcpRegistry.list({ kind: "read" }).every((tool) => tool.kind === "read"));
  assert.ok(mcpRegistry.list({ domain: "h2r" }).every((tool) => tool.domain === "h2r"));
});

test("describe() omits server-side internals", () => {
  for (const entry of mcpRegistry.describe()) {
    assert.equal("handler" in entry, false);
    assert.equal("zodSchema" in entry, false);
  }
});

test("zod schemas become JSON Schema and duplicate names are rejected", () => {
  const registry = buildRegistry([
    {
      name: "demo_get_thing",
      domain: "h2r",
      description: "demo",
      action: "get",
      zodSchema: z.object({ id: z.string().min(1), limit: z.number().optional() }),
      handler: (input) => input
    }
  ]);
  const tool = registry.get("demo_get_thing");
  assert.equal(tool?.inputSchema?.type, "object");
  assert.deepEqual(tool?.inputSchema?.required, ["id"]);
  assert.equal(tool?.zodSchema?.safeParse({}).success, false);
  assert.throws(() => registry.register({ name: "demo_get_thing", domain: "h2r", description: "dup", handler: () => null }));
  assert.throws(() => registry.register({ name: "no_handler", domain: "h2r", description: "x" }));
});
