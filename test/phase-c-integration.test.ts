/**
 * Phase C Integration Tests - Multi-Domain End-to-End Workflows
 * Tests all 4 domains with governance annotations, navlog/transcript capture, and event metadata
 */

import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db/connection";

const app = createApp();

// Test actor with authority tier 3
const testActor = {
  userId: "test-actor-001",
  authorityTier: 3,
  domain: "P2P"
};

// Test headers
const headers = {
  "Content-Type": "application/json",
  "X-API-Key": "test-key-001"
};

test("Phase C Integration Hub v2 - P2P Workflow", async (t) => {
  await t.test("should create supplier with governance links", async () => {
    const res = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Test Supplier Co.",
        email: "supplier@example.com",
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

  await t.test("should complete P2P workflow: requisition → PO → receipt → invoice → payment", async () => {
    // Step 1: Create requisition
    const reqRes = await request(app)
      .post("/api/v1/p2p/requisitions")
      .set(headers)
      .send({
        requester: "John Doe",
        department: "Engineering",
        neededByDate: "2025-02-28"
      });

    assert.equal(reqRes.status, 201);
    const requisitionId = reqRes.body.requisition_id;
    assert.deepEqual(reqRes.body._links.submit.governance, {
      riskLevel: "Low",
      requiredTier: 1
    });

    // Step 1a: Add requisition lines and verify total recalculation
    const reqLineOneRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/lines`)
      .set(headers)
      .send({
        description: "Laptop",
        quantity: 2,
        unitPrice: 1200
      });

    assert.equal(reqLineOneRes.status, 201);
    assert.equal(reqLineOneRes.body.requisition.total_amount, 2400);

    const reqLineTwoRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/lines`)
      .set(headers)
      .send({
        description: "Docking Station",
        quantity: 2,
        unitPrice: 200
      });

    assert.equal(reqLineTwoRes.status, 201);
    assert.equal(reqLineTwoRes.body.requisition.total_amount, 2800);

    const reqLinesRes = await request(app)
      .get(`/api/v1/p2p/requisitions/${requisitionId}/lines`)
      .set(headers);

    assert.equal(reqLinesRes.status, 200);
    assert.equal(reqLinesRes.body.data.length, 2);

    // Step 2: Submit requisition
    const submitRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/submit`)
      .set(headers);

    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.body._links.approve.governance.riskLevel, "Medium");

    // Step 3: Approve requisition
    const approveRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/approve`)
      .set(headers);

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body._links["convert-to-po"].governance.requiredTier, 2);

    // Create supplier first
    const supplierRes = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Test Supplier",
        email: "test@example.com",
        currencyCode: "USD"
      });

    const supplierId = supplierRes.body.supplier_id;

    // Step 4: Convert to PO
    const poRes = await request(app)
      .post(`/api/v1/p2p/requisitions/${requisitionId}/convert`)
      .set(headers)
      .send({ supplierId });

    assert.equal(poRes.status, 201);
    const poId = poRes.body.po_id;
    assert.equal(poRes.body.total_amount, 2800);
    assert.equal(poRes.body._links.approve.governance.riskLevel, "High");

    const poLinesRes = await request(app)
      .get(`/api/v1/p2p/purchase-orders/${poId}/lines`)
      .set(headers);

    assert.equal(poLinesRes.status, 200);
    assert.equal(poLinesRes.body.data.length, 2);
    const poLineTotal = poLinesRes.body.data.reduce((sum: number, line: { line_total: number }) => sum + line.line_total, 0);
    assert.equal(poLineTotal, 2800);

    // Step 5-16: Continue workflow...
    // Approve PO
    const poApproveRes = await request(app)
      .post(`/api/v1/p2p/purchase-orders/${poId}/approve`)
      .set(headers);

    assert.equal(poApproveRes.status, 200);

    // Send PO
    const sendRes = await request(app)
      .post(`/api/v1/p2p/purchase-orders/${poId}/send`)
      .set(headers);

    assert.equal(sendRes.status, 200);

    // Create goods receipt
    const grRes = await request(app)
      .post("/api/v1/p2p/goods-receipts")
      .set(headers)
      .send({ poId });

    assert.equal(grRes.status, 201);
    const receiptId = grRes.body.receipt_id;

    // Receive goods
    const receiveRes = await request(app)
      .post(`/api/v1/p2p/goods-receipts/${receiptId}/receive`)
      .set(headers);

    assert.equal(receiveRes.status, 200);

    // Accept goods receipt
    const acceptRes = await request(app)
      .post(`/api/v1/p2p/goods-receipts/${receiptId}/accept`)
      .set(headers)
      .send({ isPartial: false });

    assert.equal(acceptRes.status, 200);

    // Create supplier invoice
    const invoiceRes = await request(app)
      .post("/api/v1/p2p/supplier-invoices")
      .set(headers)
      .send({
        receiptId,
        invoiceDate: new Date().toISOString().split("T")[0],
        dueDate: "2025-03-15"
      });

    assert.equal(invoiceRes.status, 201);
    const invoiceId = invoiceRes.body.supplier_invoice_id;

    // Validate invoice
    const validateRes = await request(app)
      .post(`/api/v1/p2p/supplier-invoices/${invoiceId}/validate`)
      .set(headers);

    assert.equal(validateRes.status, 200);

    // Post invoice
    const postRes = await request(app)
      .post(`/api/v1/p2p/supplier-invoices/${invoiceId}/post`)
      .set(headers);

    assert.equal(postRes.status, 200);
    assert.equal(postRes.body._links.post.governance.riskLevel, "High");

    // Create AP payment
    const paymentRes = await request(app)
      .post("/api/v1/p2p/ap-payments")
      .set(headers)
      .send({
        supplierInvoiceId: invoiceId,
        amount: 1000,
        currencyCode: "USD"
      });

    assert.equal(paymentRes.status, 201);
    const paymentId = paymentRes.body.ap_payment_id;

    // Receive payment
    const receivePayRes = await request(app)
      .post(`/api/v1/p2p/ap-payments/${paymentId}/receive`)
      .set(headers);

    assert.equal(receivePayRes.status, 200);

    // Apply payment
    const applyRes = await request(app)
      .post(`/api/v1/p2p/ap-payments/${paymentId}/apply`)
      .set(headers);

    assert.equal(applyRes.status, 200);

    // Reconcile payment
    const recRes = await request(app)
      .post(`/api/v1/p2p/ap-payments/${paymentId}/reconcile`)
      .set(headers);

    assert.equal(recRes.status, 200);
    assert.equal(recRes.body._links.reconcile.governance.requiredTier, 2);
  });
});

test("Phase C Integration Hub v2 - R2R Workflow", async (t) => {
  await t.test("should complete R2R workflow with governance annotations", async () => {
    // Create fiscal year
    const yearRes = await request(app)
      .post("/api/v1/r2r/fiscal-years")
      .set(headers)
      .send({
        yearLabel: "2025",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
      });

    assert.equal(yearRes.status, 201);
    const fiscalYearId = yearRes.body.fiscal_year_id;

    // Verify high-risk governance tags
    assert.deepEqual(yearRes.body._links.close.governance, {
      riskLevel: "High",
      requiredTier: 4
    });

    // Create fiscal period
    const periodRes = await request(app)
      .post("/api/v1/r2r/fiscal-periods")
      .set(headers)
      .send({
        fiscalYearId,
        periodNumber: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-31"
      });

    assert.equal(periodRes.status, 201);
    const periodId = periodRes.body.fiscal_period_id;

    // Create journal
    const journalRes = await request(app)
      .post("/api/v1/r2r/journals")
      .set(headers)
      .send({
        fiscalPeriodId: periodId,
        description: "Opening balances"
      });

    assert.equal(journalRes.status, 201);

    // Verify high-risk governance on post
    assert.deepEqual(journalRes.body._links.post.governance, {
      riskLevel: "High",
      requiredTier: 3
    });
  });
});

test("Phase C Integration Hub v2 - H2R Workflow", async (t) => {
  await t.test("should complete H2R workflow with governance annotations", async () => {
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
        name: "Alice Smith",
        email: "alice@example.com"
      });

    assert.equal(empRes.status, 201);
    const employeeId = empRes.body.employee_id;

    // Verify governance on activate
    assert.deepEqual(empRes.body._links.activate.governance, {
      riskLevel: "Medium",
      requiredTier: 2
    });

    // Activate employee
    const activateRes = await request(app)
      .post(`/api/v1/h2r/employees/${employeeId}/activate`)
      .set(headers);

    assert.equal(activateRes.status, 200);

    // Create assignment
    const assignRes = await request(app)
      .post("/api/v1/h2r/assignments")
      .set(headers)
      .send({
        employeeId,
        positionId,
        startDate: "2025-02-01"
      });

    assert.equal(assignRes.status, 201);

    // Verify governance on activate
    assert.deepEqual(assignRes.body._links.activate.governance, {
      riskLevel: "Low",
      requiredTier: 1
    });
  });
});

test("Phase C Integration Hub v2 - Cross-Domain Hypermedia Links", async (t) => {
  await t.test("should include governance annotations on all state-transition links", async () => {
    // P2P: Supplier
    const supplierRes = await request(app)
      .post("/api/v1/p2p/suppliers")
      .set(headers)
      .send({
        supplierName: "Test",
        email: "test@test.com"
      });

    assert.ok(supplierRes.body._links.activate.governance);

    // R2R: Fiscal Year
    const fiscalYearRes = await request(app)
      .post("/api/v1/r2r/fiscal-years")
      .set(headers)
      .send({
        yearLabel: "2025",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
      });

    assert.ok(fiscalYearRes.body._links.close.governance);
    assert.equal(fiscalYearRes.body._links.close.governance.riskLevel, "High");

    // H2R: Employee
    const empRes = await request(app)
      .post("/api/v1/h2r/employees")
      .set(headers)
      .send({
        name: "Test",
        email: "test@test.com"
      });

    assert.ok(empRes.body._links.activate.governance);
  });
});
      const res = await request(app)
        .post("/api/v1/p2p/suppliers")
        .set(headers)
        .send({
          supplierName: "Test Supplier Co.",
          email: "supplier@example.com",
          paymentTerms: "Net 30",
          currencyCode: "USD"
        });

      expect(res.status).toBe(201);
      expect(res.body._links).toBeDefined();
      expect(res.body._links["activate"]).toBeDefined();
      expect(res.body._links["activate"].governance).toEqual({
        riskLevel: "Medium",
        requiredTier: 2
      });
    });

    it("should complete P2P workflow: requisition → PO → receipt → invoice → payment", async () => {
      // Step 1: Create requisition
      const reqRes = await request(app)
        .post("/api/v1/p2p/requisitions")
        .set(headers)
        .send({
          requester: "John Doe",
          department: "Engineering",
          neededByDate: "2025-02-28"
        });

      expect(reqRes.status).toBe(201);
      const requisitionId = reqRes.body.requisition_id;
      expect(reqRes.body._links["submit"].governance).toEqual({
        riskLevel: "Low",
        requiredTier: 1
      });

      // Step 2: Submit requisition
      const submitRes = await request(app)
        .post(`/api/v1/p2p/requisitions/${requisitionId}/submit`)
        .set(headers);

      expect(submitRes.status).toBe(200);
      expect(submitRes.body._links["approve"].governance.riskLevel).toBe("Medium");

      // Step 3: Approve requisition
      const approveRes = await request(app)
        .post(`/api/v1/p2p/requisitions/${requisitionId}/approve`)
        .set(headers);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body._links["convert-to-po"].governance.requiredTier).toBe(2);

      // Create supplier first
      const supplierRes = await request(app)
        .post("/api/v1/p2p/suppliers")
        .set(headers)
        .send({
          supplierName: "Test Supplier",
          email: "test@example.com",
          currencyCode: "USD"
        });

      const supplierId = supplierRes.body.supplier_id;

      // Step 4: Convert to PO
      const poRes = await request(app)
        .post(`/api/v1/p2p/requisitions/${requisitionId}/convert`)
        .set(headers)
        .send({ supplierId });

      expect(poRes.status).toBe(201);
      const poId = poRes.body.po_id;
      expect(poRes.body._links["approve"].governance.riskLevel).toBe("High");

      // Step 5: Approve PO
      const poApproveRes = await request(app)
        .post(`/api/v1/p2p/purchase-orders/${poId}/approve`)
        .set(headers);

      expect(poApproveRes.status).toBe(200);

      // Step 6: Send PO
      const sendRes = await request(app)
        .post(`/api/v1/p2p/purchase-orders/${poId}/send`)
        .set(headers);

      expect(sendRes.status).toBe(200);

      // Step 7: Create goods receipt
      const grRes = await request(app)
        .post("/api/v1/p2p/goods-receipts")
        .set(headers)
        .send({ poId });

      expect(grRes.status).toBe(201);
      const receiptId = grRes.body.receipt_id;

      // Step 8: Receive goods
      const receiveRes = await request(app)
        .post(`/api/v1/p2p/goods-receipts/${receiptId}/receive`)
        .set(headers);

      expect(receiveRes.status).toBe(200);

      // Step 9: Accept goods receipt
      const acceptRes = await request(app)
        .post(`/api/v1/p2p/goods-receipts/${receiptId}/accept`)
        .set(headers)
        .send({ isPartial: false });

      expect(acceptRes.status).toBe(200);

      // Step 10: Create supplier invoice
      const invoiceRes = await request(app)
        .post("/api/v1/p2p/supplier-invoices")
        .set(headers)
        .send({
          receiptId,
          invoiceDate: new Date().toISOString().split("T")[0],
          dueDate: "2025-03-15"
        });

      expect(invoiceRes.status).toBe(201);
      const invoiceId = invoiceRes.body.supplier_invoice_id;

      // Step 11: Validate invoice
      const validateRes = await request(app)
        .post(`/api/v1/p2p/supplier-invoices/${invoiceId}/validate`)
        .set(headers);

      expect(validateRes.status).toBe(200);

      // Step 12: Post invoice
      const postRes = await request(app)
        .post(`/api/v1/p2p/supplier-invoices/${invoiceId}/post`)
        .set(headers);

      expect(postRes.status).toBe(200);
      expect(postRes.body._links["post"].governance.riskLevel).toBe("High");

      // Step 13: Create AP payment
      const paymentRes = await request(app)
        .post("/api/v1/p2p/ap-payments")
        .set(headers)
        .send({
          supplierInvoiceId: invoiceId,
          amount: 1000,
          currencyCode: "USD"
        });

      expect(paymentRes.status).toBe(201);
      const paymentId = paymentRes.body.ap_payment_id;

      // Step 14: Receive payment
      const receivePayRes = await request(app)
        .post(`/api/v1/p2p/ap-payments/${paymentId}/receive`)
        .set(headers);

      expect(receivePayRes.status).toBe(200);

      // Step 15: Apply payment
      const applyRes = await request(app)
        .post(`/api/v1/p2p/ap-payments/${paymentId}/apply`)
        .set(headers);

      expect(applyRes.status).toBe(200);

      // Step 16: Reconcile payment
      const recRes = await request(app)
        .post(`/api/v1/p2p/ap-payments/${paymentId}/reconcile`)
        .set(headers);

      expect(recRes.status).toBe(200);

      expect(recRes.body._links["reconcile"].governance.requiredTier).toBe(2);
    });
  });

  describe("O2C Workflow: Customer → Quote → Order → Shipment → Invoice → Payment", () => {
    it("should complete O2C workflow", async () => {
      // Step 1: Create customer
      const custRes = await request(app)
        .post("/api/v1/o2c/customers")
        .set(headers)
        .send({
          name: "ACME Corp",
          email: "contact@acme.com",
          paymentTerms: "Net 60"
        });

      expect(custRes.status).toBe(201);
      const customerId = custRes.body.customer_id;
      expect(custRes.body._links["activate"]).toBeDefined();

      // Step 2: Create quote
      const quoteRes = await request(app)
        .post("/api/v1/o2c/quotes")
        .set(headers)
        .send({
          customerId,
          totalAmount: 5000,
          expiryDate: "2025-03-15"
        });

      expect(quoteRes.status).toBe(201);
      const quoteId = quoteRes.body.quote_id;
      expect(quoteRes.body._links["send"].governance.riskLevel).toBe("Low");

      // Verify governance annotations exist
      expect(quoteRes.body._links["send"].governance).toEqual({
        riskLevel: "Low",
        requiredTier: 1
      });
      expect(quoteRes.body._links["accept"].governance).toEqual({
        riskLevel: "Medium",
        requiredTier: 2
      });
    });
  });

  describe("R2R Workflow: Journal → Post → Trial Balance", () => {
    it("should complete R2R workflow with governance annotations", async () => {
      // Step 1: Create fiscal year
      const yearRes = await request(app)
        .post("/api/v1/r2r/fiscal-years")
        .set(headers)
        .send({
          yearLabel: "2025",
          startDate: "2025-01-01",
          endDate: "2025-12-31"
        });

      expect(yearRes.status).toBe(201);
      const fiscalYearId = yearRes.body.fiscal_year_id;

      // Verify high-risk governance tags
      expect(yearRes.body._links["close"].governance).toEqual({
        riskLevel: "High",
        requiredTier: 4
      });

      // Step 2: Create fiscal period
      const periodRes = await request(app)
        .post("/api/v1/r2r/fiscal-periods")
        .set(headers)
        .send({
          fiscalYearId,
          periodNumber: 1,
          startDate: "2025-01-01",
          endDate: "2025-01-31"
        });

      expect(periodRes.status).toBe(201);
      const periodId = periodRes.body.fiscal_period_id;

      // Step 3: Create account
      const acctRes = await request(app)
        .post("/api/v1/r2r/accounts")
        .set(headers)
        .send({
          accountCode: "1000",
          accountName: "Cash",
          accountType: "Asset"
        });

      expect(acctRes.status).toBe(201);
      const accountId = acctRes.body.account_id;

      // Step 4: Create journal
      const journalRes = await request(app)
        .post("/api/v1/r2r/journals")
        .set(headers)
        .send({
          fiscalPeriodId: periodId,
          description: "Opening balances"
        });

      expect(journalRes.status).toBe(201);
      const journalId = journalRes.body.journal_id;

      // Verify high-risk governance on post
      expect(journalRes.body._links["post"].governance).toEqual({
        riskLevel: "High",
        requiredTier: 3
      });
    });
  });

  describe("H2R Workflow: Employee → Assignment → Credential", () => {
    it("should complete H2R workflow with governance annotations", async () => {
      // Step 1: Create position
      const posRes = await request(app)
        .post("/api/v1/h2r/positions")
        .set(headers)
        .send({
          title: "Software Engineer",
          department: "Engineering",
          authorityDomain: "H2R",
          authorityTier: 2
        });

      expect(posRes.status).toBe(201);
      const positionId = posRes.body.position_id;

      // Step 2: Create employee
      const empRes = await request(app)
        .post("/api/v1/h2r/employees")
        .set(headers)
        .send({
          name: "Alice Smith",
          email: "alice@example.com"
        });

      expect(empRes.status).toBe(201);
      const employeeId = empRes.body.employee_id;

      // Verify governance on activate
      expect(empRes.body._links["activate"].governance).toEqual({
        riskLevel: "Medium",
        requiredTier: 2
      });

      // Step 3: Activate employee
      const activateRes = await request(app)
        .post(`/api/v1/h2r/employees/${employeeId}/activate`)
        .set(headers);

      expect(activateRes.status).toBe(200);

      // Step 4: Create assignment
      const assignRes = await request(app)
        .post("/api/v1/h2r/assignments")
        .set(headers)
        .send({
          employeeId,
          positionId,
          startDate: "2025-02-01"
        });

      expect(assignRes.status).toBe(201);
      const assignmentId = assignRes.body.assignment_id;

      // Verify governance on activate
      expect(assignRes.body._links["activate"].governance).toEqual({
        riskLevel: "Low",
        requiredTier: 1
      });

      // Step 5: Activate assignment
      const activateAssignRes = await request(app)
        .post(`/api/v1/h2r/assignments/${assignmentId}/activate`)
        .set(headers);

      expect(activateAssignRes.status).toBe(200);

      // Step 6: Issue credential
      const credRes = await request(app)
        .post("/api/v1/h2r/credentials")
        .set(headers)
        .send({
          employeeId,
          type: "SystemAccess",
          expiryDate: "2026-02-01"
        });

      expect(credRes.status).toBe(201);
      expect(credRes.body._links).toBeDefined();
    });
  });

  describe("Navlog & Transcript Capture", () => {
    it("should capture navlog entries for workflow decisions", async () => {
      // Start a REPL session
      const sessionRes = await request(app)
        .post("/api/v1/hub/sessions")
        .set(headers)
        .send({});

      expect(sessionRes.status).toBe(201);
      const sessionId = sessionRes.body.session_id;

      // Create a requisition to capture in navlog
      const reqRes = await request(app)
        .post("/api/v1/p2p/requisitions")
        .set(headers)
        .send({
          requester: "Jane Doe",
          department: "Operations"
        });

      expect(reqRes.status).toBe(201);

      // Query navlog entries
      const navlogRes = await request(app)
        .get(`/api/v1/hub/sessions/${sessionId}/navlog`)
        .set(headers);

      expect(navlogRes.status).toBe(200);
      expect(Array.isArray(navlogRes.body.data)).toBe(true);
    });

    it("should capture governance decisions", async () => {
      // Start session
      const sessionRes = await request(app)
        .post("/api/v1/hub/sessions")
        .set(headers)
        .send({});

      const sessionId = sessionRes.body.session_id;

      // Create and approve a requisition (requires governance check)
      const reqRes = await request(app)
        .post("/api/v1/p2p/requisitions")
        .set(headers)
        .send({
          requester: "Test",
          department: "Dept"
        });

      const requisitionId = reqRes.body.requisition_id;

      // Submit
      await request(app)
        .post(`/api/v1/p2p/requisitions/${requisitionId}/submit`)
        .set(headers);

      // Approve (should trigger governance decision)
      const approveRes = await request(app)
        .post(`/api/v1/p2p/requisitions/${requisitionId}/approve`)
        .set(headers);

      assert.equal(approveRes.status, 200);
    });
  });
});
