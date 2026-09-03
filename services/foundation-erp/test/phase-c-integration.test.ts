/**
 * Phase C Integration Tests - Multi-Domain End-to-End Workflows
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import test, { before } from "node:test";
import request from "supertest";

const rootDir = process.cwd();
const testDbPath = path.join(rootDir, "test-phase-c-integration.db");

function removeIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function resetTestDb(): void {
  removeIfExists(testDbPath);
  removeIfExists(`${testDbPath}-wal`);
  removeIfExists(`${testDbPath}-shm`);

  const db = new Database(testDbPath);
  const migrationsDir = path.join(rootDir, "src", "db", "migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS migration (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO migration(id, applied_at) VALUES (?, ?)");

  for (const fileName of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
    db.exec(sql);
    insert.run(fileName, now);
  }

  db.close();
}

process.env.NODE_ENV = "test";
process.env.API_KEY = "test-api-key";
process.env.INTERNAL_ALLOWLIST = "127.0.0.1,::1";
process.env.INGRESS_ID_HEADER = "x-ingress-id";
process.env.INGRESS_ID_VALUE = "foundation-ingress";
process.env.DATABASE_PATH = testDbPath;

let app: any;

before(async () => {
  resetTestDb();
  const appModule = await import("../src/app");
  app = appModule.createApp();
});

const headers = {
  "Content-Type": "application/json",
  "x-api-key": process.env.API_KEY,
  "x-ingress-id": process.env.INGRESS_ID_VALUE
};

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}

test("Phase C Integration Hub v2 - P2P Workflow", async (t) => {
  await t.test("should create supplier with governance links", async () => {
    const res = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Test Supplier Co.",
        email: uniqueEmail("supplier"),
        paymentTerms: "Net 30",
        currencyCode: "USD"
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._links);
    assert.ok(res.body._links.activate);
    assert.deepEqual(res.body._links.activate.governance, {
      riskLevel: "Medium",
      requiredTier: 2
    });
  });

  await t.test("should complete P2P workflow: requisition -> PO -> receipt -> invoice -> payment", async () => {
    const reqRes = await request(app)
      .post("/api/v1/p2p/requisitions")
      .set(headers)
      .send({ requester: "John Doe", department: "Engineering", neededByDate: "2025-02-28" });

    assert.equal(reqRes.status, 201);
    const requisitionId = reqRes.body.requisition_id;

    const lineRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/lines`)
      .set(headers)
      .send({ description: "Laptop", quantity: 2, unitPrice: 1200 });

    assert.equal(lineRes.status, 201);

    const submitRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/submit`)
      .set(headers);
    assert.equal(submitRes.status, 200);

    const approveRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/approve`)
      .set(headers);
    assert.equal(approveRes.status, 200);

    const supplierRes = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({ supplierName: "Test Supplier", email: uniqueEmail("supplier2"), currencyCode: "USD" });
    assert.equal(supplierRes.status, 201);

    const poRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/convert`)
      .set(headers)
      .send({ supplierId: supplierRes.body.supplier_id });
    assert.equal(poRes.status, 201);

    const poApproveRes = await request(app)
      .post(`/api/v1/p2p/purchase-orders/${poRes.body.po_id}/approve`)
      .set(headers);
    assert.equal(poApproveRes.status, 200);

    const poSendRes = await request(app)
      .post(`/api/v1/p2p/purchase-orders/${poRes.body.po_id}/send`)
      .set(headers);
    assert.equal(poSendRes.status, 200);

    const receiptRes = await request(app)
      .post("/api/v1/p2p/goods-receipts")
      .set(headers)
      .send({ poId: poRes.body.po_id });
    assert.equal(receiptRes.status, 201);
  });
});

test("Phase C Integration Hub v2 - R2R Workflow", async (t) => {
  await t.test("should complete R2R workflow with governance annotations", async () => {
    const yearRes = await request(app)
      .post("/api/v1/r2r/fiscal-years")
      .set(headers)
      .send({ yearLabel: "2025", startDate: "2025-01-01", endDate: "2025-12-31" });

    assert.equal(yearRes.status, 201);
    const periodRes = await request(app)
      .post("/api/v1/r2r/fiscal-periods")
      .set(headers)
      .send({
        fiscalYearId: yearRes.body.fiscal_year_id,
        periodNumber: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-31"
      });

    assert.equal(periodRes.status, 201);

    const journalRes = await request(app)
      .post("/api/v1/r2r/journals")
      .set(headers)
      .send({ fiscalPeriodId: periodRes.body.fiscal_period_id, description: "Opening balances" });

    assert.equal(journalRes.status, 201);
    assert.deepEqual(journalRes.body._links.post.governance, {
      riskLevel: "High",
      requiredTier: 3
    });
  });
});

test("Phase C Integration Hub v2 - H2R Workflow", async (t) => {
  await t.test("should complete H2R workflow with governance annotations", async () => {
    const posRes = await request(app)
      .post("/api/v1/h2r/positions")
      .set(headers)
      .send({ title: "Software Engineer", department: "Engineering", authorityDomain: "H2R", authorityTier: 2 });

    assert.equal(posRes.status, 201);

    const empRes = await request(app)
      .post("/api/v1/h2r/employees")
      .set(headers)
      .send({ name: "Alice Smith", email: uniqueEmail("alice") });

    assert.equal(empRes.status, 201);

    const assignRes = await request(app)
      .post("/api/v1/h2r/assignments")
      .set(headers)
      .send({ employeeId: empRes.body.employee_id, positionId: posRes.body.position_id, startDate: "2025-02-01" });

    assert.equal(assignRes.status, 201);
  });
});
