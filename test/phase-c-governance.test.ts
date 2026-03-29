/**
 * Phase C Integration Tests - Multi-Domain Governance Validation
 * Validates that all domains expose correct governance annotations
 */

import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": "test-key-001"
};

test("Phase C - Governance Annotations", async (t) => {
  await t.test("P2P: Supplier has governance links", async () => {
    const res = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Test Supplier",
        email: "supplier@example.com",
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
        email: "alice@example.com"
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

    const positionId = posRes.body.position_id;

    // Create employee
    const empRes = await request(app)
      .post("/api/v1/h2r/employees")
      .set(headers)
      .send({
        name: "Bob Johnson",
        email: "bob@example.com"
      });

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
        email: "corp@example.com"
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
        email: "jane@example.com"
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
