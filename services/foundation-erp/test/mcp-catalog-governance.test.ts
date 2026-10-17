import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { mcpCatalog } from "../src/api/mcp/catalog";

const handlerSource = fs.readFileSync(path.join(__dirname, "../src/api/mcp/mcp.routes.ts"), "utf8");
const MESH_DOMAINS = new Set(["o2c", "p2p", "r2r", "h2r", "inv", "proj", "bom"]);

// The Mesh evaluates MCP calls from this metadata (domain, entity, action), so every function must carry it.
test("every MCP function carries the metadata the Mesh needs to govern it", () => {
  const missing = mcpCatalog
    .filter((fn) => !fn.entity || !fn.action || !fn.governanceTag || !fn.riskLevel)
    .map((fn) => fn.name);
  assert.deepEqual(missing, []);
});

test("MCP function names are unique and each has an invoke handler", () => {
  const names = mcpCatalog.map((fn) => fn.name);
  assert.equal(new Set(names).size, names.length);
  const unhandled = names.filter((name) => !handlerSource.includes(`case "${name}"`));
  assert.deepEqual(unhandled, []);
});

test("MCP governance tags follow DOMAIN.Entity.Action or the legacy snake_case form", () => {
  for (const fn of mcpCatalog) {
    assert.ok(MESH_DOMAINS.has(fn.domain), `${fn.name} has unsupported domain ${fn.domain}`);
    assert.match(fn.governanceTag ?? "", /^[A-Za-z0-9_.]+$/, `${fn.name} has malformed governanceTag`);
  }
});

test("approval-type MCP functions are not rated Low risk", () => {
  const lowApprovals = mcpCatalog.filter((fn) => /approve/i.test(fn.action ?? "") && fn.riskLevel === "Low").map((fn) => fn.name);
  assert.deepEqual(lowApprovals, []);
});
