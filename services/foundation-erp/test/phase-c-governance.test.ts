/**
 * Phase C Integration Tests - Multi-Domain Governance Validation
 * Validates that all domains expose correct governance annotations
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import test, { before } from "node:test";
import request from "supertest";

const rootDir = process.cwd();
const testDbPath = path.join(rootDir, "test-phase-c-governance.db");

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

test("Phase C - Governance Annotations", async (t) => {
  await t.test("P2P: Supplier has governance links", async () => {
    const res = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Test Supplier",
        email: uniqueEmail("supplier"),
        currencyCode: "USD"
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._links.activate.governance);
    assert.equal(res.body._links.activate.governance.riskLevel, "Medium");
    assert.equal(res.body._links.activate.governance.requiredTier, 2);
  });

  await t.test("P2P: Requisition has governance links", async () => {
    const res = await request(app)
      .post("/api/v1/p2p/requisitions")
      .set(headers)
      .send({
        requester: "John Doe",
        department: "Engineering"
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._links.submit.governance);
    assert.equal(res.body._links.submit.governance.riskLevel, "Low");
  });

  await t.test("R2R: Fiscal Year has governance links", async () => {
    const res = await request(app)
      .post("/api/v1/r2r/fiscal-years")
      .set(headers)
      .send({
        yearLabel: "2025",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._links.close.governance);
    assert.equal(res.body._links.close.governance.riskLevel, "High");
    assert.equal(res.body._links.close.governance.requiredTier, 4);
  });

  await t.test("H2R: Employee has governance links", async () => {
    const res = await request(app)
      .post("/api/v1/h2r/employees")
      .set(headers)
      .send({
        name: "Alice Smith",
        email: uniqueEmail("alice")
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._links.activate.governance);
    assert.equal(res.body._links.activate.governance.riskLevel, "Medium");
    assert.equal(res.body._links.activate.governance.requiredTier, 2);
  });

  await t.test("H2R: Assignment has governance links", async () => {
    // Create position
    const posRes = await request(app)
      .post("/api/v1/h2r/positions")
      .set(headers)
      .send({
        title: "Software Engineer",
        department: "Engineering",
        authorityDomain: "H2R",
        authorityTier: 2
      });
    assert.equal(posRes.status, 201);

    const positionId = posRes.body.position_id;

    // Create employee
    const empRes = await request(app)
      .post("/api/v1/h2r/employees")
      .set(headers)
      .send({
        name: "Bob Johnson",
        email: uniqueEmail("bob")
      });
    assert.equal(empRes.status, 201);

    const employeeId = empRes.body.employee_id;

    // Create assignment
    const res = await request(app)
      .post("/api/v1/h2r/assignments")
      .set(headers)
      .send({
        employeeId,
        positionId,
        startDate: "2025-02-01"
      });

    assert.equal(res.status, 201);
    assert.ok(res.body._links.activate.governance);
    assert.equal(res.body._links.activate.governance.riskLevel, "Low");
  });

  await t.test("All P2P entities have governance annotations", async () => {
    // Test all major P2P entities have governance on state-change links

    // Supplier
    const supplierRes = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Corp Inc",
        email: uniqueEmail("corp")
      });
    assert.ok(supplierRes.body._links.activate.governance);

    // Requisition
    const reqRes = await request(app)
      .post("/api/v1/p2p/requisitions")
      .set(headers)
      .send({
        requester: "User",
        department: "Dept"
      });
    assert.ok(reqRes.body._links.submit.governance);

    // Purchase Order (requires requisition first)
    const poRes = await request(app)
      .post("/api/v1/p2p/purchase-orders")
      .set(headers)
      .send({
        supplierId: supplierRes.body.supplier_id,
        totalAmount: 5000,
        currencyCode: "USD"
      });
    assert.equal(poRes.status, 201);
    assert.ok(poRes.body._links.approve.governance);
  });

  await t.test("All R2R entities have governance annotations", async () => {
    // Fiscal Year
    const yearRes = await request(app)
      .post("/api/v1/r2r/fiscal-years")
      .set(headers)
      .send({
        yearLabel: "2025",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
      });
    assert.ok(yearRes.body._links.close.governance);

    // Fiscal Period
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
    assert.ok(periodRes.body._links["start-close"].governance);

    // Journal
    const journalRes = await request(app)
      .post("/api/v1/r2r/journals")
      .set(headers)
      .send({
        fiscalPeriodId: periodRes.body.fiscal_period_id,
        description: "Test Journal"
      });
    assert.equal(journalRes.status, 201);
    assert.ok(journalRes.body._links.post.governance);
    assert.equal(journalRes.body._links.post.governance.riskLevel, "High");
  });

  await t.test("All H2R entities have governance annotations", async () => {
    // Position
    const posRes = await request(app)
      .post("/api/v1/h2r/positions")
      .set(headers)
      .send({
        title: "Manager",
        department: "Sales",
        authorityDomain: "O2C",
        authorityTier: 3
      });
    assert.equal(posRes.status, 201);

    // Employee
    const empRes = await request(app)
      .post("/api/v1/h2r/employees")
      .set(headers)
      .send({
        name: "Jane Doe",
        email: uniqueEmail("jane")
      });
    assert.ok(empRes.body._links.activate.governance);

    // Assignment
    const assignRes = await request(app)
      .post("/api/v1/h2r/assignments")
      .set(headers)
      .send({
        employeeId: empRes.body.employee_id,
        positionId: posRes.body.position_id
      });
    assert.equal(assignRes.status, 201);
    assert.ok(assignRes.body._links.activate.governance);
    assert.equal(assignRes.body._links.activate.governance.riskLevel, "Low");

    // Credential
    const credRes = await request(app)
      .post("/api/v1/h2r/credentials")
      .set(headers)
      .send({
        employeeId: empRes.body.employee_id,
        type: "SystemAccess"
      });
    assert.equal(credRes.status, 201);
    assert.ok(credRes.body._links.revoke.governance);
  });
});
