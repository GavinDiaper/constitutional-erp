import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import test, { after, before } from "node:test";
import request from "supertest";

const rootDir = process.cwd();
const testDbPath = path.join(rootDir, "test-mcp-read-tools.db");

function removeDb(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(`${testDbPath}${suffix}`)) fs.unlinkSync(`${testDbPath}${suffix}`);
  }
}

function migrate(): void {
  removeDb();
  const raw = new Database(testDbPath);
  const dir = path.join(rootDir, "src", "db", "migrations");
  raw.exec("CREATE TABLE IF NOT EXISTS migration (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
  const insert = raw.prepare("INSERT INTO migration(id, applied_at) VALUES (?, ?)");
  for (const file of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    raw.exec(fs.readFileSync(path.join(dir, file), "utf8"));
    insert.run(file, new Date().toISOString());
  }
  raw.close();
}

process.env.NODE_ENV = "test";
process.env.API_KEY = "test-api-key";
process.env.INTERNAL_ALLOWLIST = "127.0.0.1,::1";
process.env.INGRESS_ID_HEADER = "x-ingress-id";
process.env.INGRESS_ID_VALUE = "foundation-ingress";
process.env.DATABASE_PATH = testDbPath;
delete process.env.AUTHORITY_ENGINE_URL;

const headers = {
  "Content-Type": "application/json",
  "x-api-key": "test-api-key",
  "x-ingress-id": "foundation-ingress"
};

let app: any;
let readModelModule: typeof import("../src/api/mcp/readModel");
let readToolsModule: typeof import("../src/api/mcp/readTools");
let registry: typeof import("../src/api/mcp/mcp.routes")["mcpRegistry"];

before(async () => {
  migrate();
  app = (await import("../src/app")).createApp();
  readModelModule = await import("../src/api/mcp/readModel");
  readToolsModule = await import("../src/api/mcp/readTools");
  registry = (await import("../src/api/mcp/mcp.routes")).mcpRegistry;
});

after(() => removeDb());

async function invoke(functionName: string, input: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/mcp/invoke").set(headers).send({ functionName, input });
}

test("read model matches the real schema and covers every table", () => {
  assert.deepEqual(readModelModule.validateReadModel(), []);
});

test("every whitelisted table with mcp enabled has get/list/find/describe coverage", () => {
  const missing: string[] = [];
  for (const entry of readModelModule.readModel.filter((e) => e.mcp)) {
    const names = readToolsModule.readToolNames(entry);
    for (const [verb, name] of Object.entries(names)) {
      if (name && !registry.get(name)) missing.push(`${entry.table}:${verb}:${name}`);
    }
    if (entry.primaryKey) assert.ok(names.get && names.find, `${entry.table} needs get/find`);
  }
  assert.deepEqual(missing, []);
});

test("read tools are Low risk, kind=read and have JSON schemas", () => {
  const reads = registry.list({ kind: "read" });
  assert.ok(reads.length > 300, `expected many read tools, got ${reads.length}`);
  for (const tool of reads) {
    assert.equal(tool.riskLevel, "Low", tool.name);
    assert.ok(tool.governanceTag, tool.name);
  }
  const generated = registry.get("h2r_find_position");
  assert.equal(generated?.inputSchema?.type, "object");
  assert.deepEqual(generated?.inputSchema?.required, ["text"]);
});

test("name lookup: find positions/employees, ambiguity and get with children", async () => {
  const pos = await invoke("h2r_create_position", { title: "Senior Analyst", department: "Finance", authorityDomain: "P2P", authorityTier: 2 });
  assert.equal(pos.status, 200, JSON.stringify(pos.body));
  await invoke("h2r_create_position", { title: "Junior Analyst", department: "Finance", authorityDomain: "P2P", authorityTier: 1 });
  const positionId = pos.body.result.position_id ?? pos.body.result.positionId;
  assert.ok(positionId, JSON.stringify(pos.body));

  const one = await invoke("h2r_find_position", { text: "senior analyst" });
  assert.equal(one.status, 200, JSON.stringify(one.body));
  assert.equal(one.body.result.resolved, positionId);
  assert.equal(one.body.result.ambiguous, false);

  const many = await invoke("h2r_find_position", { text: "analyst" });
  assert.equal(many.body.result.candidates.length, 2);
  assert.equal(many.body.result.ambiguous, true);
  assert.equal(many.body.result.resolved, undefined);

  const none = await invoke("h2r_find_position", { text: "astronaut" });
  assert.deepEqual(none.body.result.candidates, []);

  const emp = await invoke("h2r_create_employee", { name: "Alice Walker", email: "alice.walker@example.com" });
  assert.equal(emp.status, 200, JSON.stringify(emp.body));
  const found = await invoke("h2r_find_employee", { text: "Alice" });
  assert.equal(found.body.result.candidates[0].label, "Alice Walker");
  assert.equal(JSON.stringify(found.body.result).includes("alice.walker@example.com"), false, "email must be excluded");

  const got = await invoke("h2r_get_position", { id: positionId });
  assert.equal(got.body.result.record.title, "Senior Analyst");
});

test("list: filters, state, paging, field projection and validation errors", async () => {
  for (const requester of ["R1", "R2", "R3"]) {
    const res = await invoke("p2p_create_requisition", {
      requester, department: "Ops", currencyCode: "USD", neededByDate: "2026-12-01", legalEntityId: "LE-SEED-DEFAULT"
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  const page1 = await invoke("p2p_list_requisitions", { limit: 2 });
  assert.equal(page1.body.result.rows.length, 2);
  assert.equal(page1.body.result.paging.hasMore, true);
  const page2 = await invoke("p2p_list_requisitions", { limit: 2, offset: page1.body.result.paging.nextOffset });
  assert.equal(page2.body.result.rows.length, 1);

  const byFilter = await invoke("p2p_list_requisitions", { filters: { requester: "R2" }, fields: ["requisition_id", "requester"] });
  assert.equal(byFilter.body.result.rows.length, 1);
  assert.deepEqual(Object.keys(byFilter.body.result.rows[0]).sort(), ["requester", "requisition_id"]);

  const byState = await invoke("p2p_list_requisitions", { state: "Draft" });
  assert.equal(byState.body.result.rows.length, 3);

  const badColumn = await invoke("p2p_list_requisitions", { filters: { "1=1; DROP TABLE x": "a" } });
  assert.equal(badColumn.status, 400);
  const badLimit = await invoke("p2p_list_requisitions", { limit: 5000 });
  assert.equal(badLimit.status, 400);
});

test("write invoke validates required fields and blocks a disallowed current state", async () => {
  const missingId = await invoke("p2p_submit_requisition");
  assert.equal(missingId.status, 400);
  assert.equal(missingId.body.title, "invalid_input");

  const created = await invoke("p2p_create_requisition", {
    requester: "Guard", department: "Ops", currencyCode: "USD", neededByDate: "2026-12-01", legalEntityId: "LE-SEED-DEFAULT"
  });
  const requisitionId = created.body.result.requisition?.requisition_id ?? created.body.result.requisition_id ?? created.body.result.requisitionId;
  assert.ok(requisitionId, JSON.stringify(created.body));
  const invalidState = await invoke("p2p_submit_requisition", { requisitionId: "not-a-requisition" });
  assert.equal(invalidState.status, 404);
  const draftState = await invoke("p2p_approve_requisition", { requisitionId });
  assert.equal(draftState.status, 409);
  assert.equal(draftState.body.title, "invalid_entity_state");
});

test("get with child lines, 404 and describe", async () => {
  const req = await invoke("p2p_create_requisition", {
    requester: "Lines", department: "Ops", currencyCode: "USD", neededByDate: "2026-12-01", legalEntityId: "LE-SEED-DEFAULT"
  });
  const requisitionId = req.body.result.requisition?.requisition_id ?? req.body.result.requisition_id ?? req.body.result.requisitionId;
  assert.ok(requisitionId, JSON.stringify(req.body));
  const line = await invoke("p2p_add_requisition_line", { requisitionId, description: "Laptop", quantity: 2, unitPrice: 1000 });
  assert.equal(line.status, 200, JSON.stringify(line.body));

  const got = await invoke("p2p_get_requisition", { id: requisitionId, include: ["p2p_requisition_line"] });
  assert.equal(got.status, 200, JSON.stringify(got.body));
  assert.equal(got.body.result.children.p2p_requisition_line.length, 1);
  assert.equal(got.body.result.children.p2p_requisition_line[0].description, "Laptop");

  const badInclude = await invoke("p2p_get_requisition", { id: requisitionId, include: ["nope"] });
  assert.equal(badInclude.status, 400);
  const missing = await invoke("p2p_get_requisition", { id: "REQ-does-not-exist" });
  assert.equal(missing.status, 404);

  const described = await invoke("p2p_describe_requisition");
  assert.equal(described.body.result.stateColumn, "state");
  assert.ok(described.body.result.stateValues.includes("Draft"));
  assert.ok(described.body.result.children.some((c: any) => c.table === "p2p_requisition_line"));
});

test("composite/rowid and view tables are readable", async () => {
  const members = await invoke("r2r_list_ledger_set_members");
  assert.equal(members.status, 200);
  const view = await invoke("sys_list_v_field_coverages", { limit: 5 });
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.equal(registry.get("sys_get_v_field_coverage"), undefined);
});

test("cross-cutting tools: tables, history and engine tools without a configured engine", async () => {
  const tables = await invoke("erp_list_tables", { domain: "h2r" });
  assert.ok(tables.body.result.data.some((t: any) => t.table === "h2r_position"));

  const pos = await invoke("h2r_create_position", { title: "History Pos", department: "X", authorityDomain: "R2R", authorityTier: 1 });
  const id = pos.body.result.position_id ?? pos.body.result.positionId;
  const history = await invoke("erp_get_history", { entityId: id });
  assert.equal(history.status, 200);
  assert.ok(history.body.result.events.length >= 1);
  assert.equal(typeof history.body.result.events[0].payload, "object");

  const approvers = await invoke("authority_list_eligible_approvers", { domain: "P2P", tier: 2 });
  assert.equal(approvers.status, 503);
  assert.equal((await invoke("gov_get_parameters")).status, 503);
});

test("GET /query still serves the shared whitelist", async () => {
  const tables = await request(app).get("/api/v1/query/tables").set(headers);
  assert.equal(tables.status, 200);
  assert.ok(tables.body.data.some((t: any) => t.name === "h2r_position"));
  const view = await request(app).get("/api/v1/query/v_field_coverage/anything").set(headers);
  assert.equal(view.status, 404);
});
