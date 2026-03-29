import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import test, { before } from "node:test";

const rootDir = process.cwd();
const testDbPath = path.join(rootDir, "test-foundation.db");

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

  for (const fileName of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
    db.exec(sql);
  }

  db.close();
}

function authHeaders() {
  return {
    "x-api-key": process.env.API_KEY ?? "change-me",
    "x-ingress-id": process.env.INGRESS_ID_VALUE ?? "foundation-ingress"
  };
}

let app: any;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY = "test-api-key";
  process.env.INTERNAL_ALLOWLIST = "127.0.0.1,::1";
  process.env.INGRESS_ID_HEADER = "x-ingress-id";
  process.env.INGRESS_ID_VALUE = "foundation-ingress";
  process.env.DATABASE_PATH = testDbPath;

  resetTestDb();

  const appModule = await import("../src/app");
  app = appModule.createApp();
});

test("P2P integration flow transitions through canonical lifecycle", async () => {
  const headers = authHeaders();

  const supplier = await request(app)
    .post("/api/v1/p2p/suppliers")
    .set(headers)
    .send({ supplierName: "Supplier One", email: "ap@supplier.one" })
    .expect(201);

  const requisition = await request(app)
    .post("/api/v1/p2p/requisitions")
    .set(headers)
    .send({ requester: "ops.user" })
    .expect(201);

  await request(app).post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/submit`).set(headers).expect(200);
  await request(app).post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/approve`).set(headers).expect(200);

  const po = await request(app)
    .post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/convert`)
    .set(headers)
    .send({ supplierId: supplier.body.supplier_id })
    .expect(201);

  await request(app).post(`/api/v1/p2p/purchase-orders/${po.body.po_id}/approve`).set(headers).expect(200);
  await request(app).post(`/api/v1/p2p/purchase-orders/${po.body.po_id}/send`).set(headers).expect(200);

  const receipt = await request(app)
    .post("/api/v1/p2p/goods-receipts")
    .set(headers)
    .send({ poId: po.body.po_id })
    .expect(201);

  await request(app).post(`/api/v1/p2p/goods-receipts/${receipt.body.receipt_id}/receive`).set(headers).expect(200);
  await request(app).post(`/api/v1/p2p/goods-receipts/${receipt.body.receipt_id}/accept`).set(headers).expect(200);

  const supplierInvoice = await request(app)
    .post("/api/v1/p2p/supplier-invoices")
    .set(headers)
    .send({ receiptId: receipt.body.receipt_id })
    .expect(201);

  await request(app)
    .post(`/api/v1/p2p/supplier-invoices/${supplierInvoice.body.supplier_invoice_id}/validate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/p2p/supplier-invoices/${supplierInvoice.body.supplier_invoice_id}/post`)
    .set(headers)
    .expect(200);

  const apPayment = await request(app)
    .post("/api/v1/p2p/ap-payments")
    .set(headers)
    .send({ supplierInvoiceId: supplierInvoice.body.supplier_invoice_id, amount: 0.01 })
    .expect(201);

  await request(app)
    .post(`/api/v1/p2p/ap-payments/${apPayment.body.ap_payment_id}/receive`)
    .set(headers)
    .expect(200);

  const appliedPayment = await request(app)
    .post(`/api/v1/p2p/ap-payments/${apPayment.body.ap_payment_id}/apply`)
    .set(headers)
    .expect(200);

  const reconciledPayment = await request(app)
    .post(`/api/v1/p2p/ap-payments/${apPayment.body.ap_payment_id}/reconcile`)
    .set(headers)
    .expect(200);

  assert.equal(appliedPayment.body.state, "Applied");
  assert.equal(reconciledPayment.body.state, "Reconciled");

  const invoiceAfterPayment = await request(app)
    .get(`/api/v1/p2p/supplier-invoices/${supplierInvoice.body.supplier_invoice_id}`)
    .set(headers)
    .expect(200);

  assert.equal(invoiceAfterPayment.body.state, "Paid");
});

test("R2R integration flow enforces period lifecycle and posting rules", async () => {
  const headers = authHeaders();

  const account = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "1100", accountName: "Cash on Hand", accountType: "Asset" })
    .expect(201);

  const fiscalYear = await request(app)
    .post("/api/v1/r2r/fiscal-years")
    .set(headers)
    .send({ yearLabel: "FY2027", startDate: "2027-01-01", endDate: "2027-12-31" })
    .expect(201);

  const fiscalPeriod = await request(app)
    .post("/api/v1/r2r/fiscal-periods")
    .set(headers)
    .send({
      fiscalYearId: fiscalYear.body.fiscal_year_id,
      periodNumber: 1,
      startDate: "2027-01-01",
      endDate: "2027-01-31"
    })
    .expect(201);

  const journal = await request(app)
    .post("/api/v1/r2r/journals")
    .set(headers)
    .send({ fiscalPeriodId: fiscalPeriod.body.fiscal_period_id, description: "Opening cash" })
    .expect(201);

  await request(app)
    .post(`/api/v1/r2r/journals/${journal.body.journal_id}/lines`)
    .set(headers)
    .send({ accountId: account.body.account_id, debitAmount: 10, creditAmount: 0, memo: "opening" })
    .expect(201);

  const postedJournal = await request(app)
    .post(`/api/v1/r2r/journals/${journal.body.journal_id}/post`)
    .set(headers)
    .expect(200);

  assert.equal(postedJournal.body.state, "Posted");

  await request(app)
    .post(`/api/v1/r2r/fiscal-periods/${fiscalPeriod.body.fiscal_period_id}/close`)
    .set(headers)
    .expect(200);

  const lockedPeriod = await request(app)
    .post(`/api/v1/r2r/fiscal-periods/${fiscalPeriod.body.fiscal_period_id}/lock`)
    .set(headers)
    .expect(200);

  assert.equal(lockedPeriod.body.state, "Locked");

  const createInLockedPeriod = await request(app)
    .post("/api/v1/r2r/journals")
    .set(headers)
    .send({ fiscalPeriodId: fiscalPeriod.body.fiscal_period_id, description: "Should fail" })
    .expect(409);

  assert.equal(createInLockedPeriod.body.title, "invalid_transition");
});

test("H2R integration flow transitions through workforce lifecycle", async () => {
  const headers = authHeaders();

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({ name: "Alice Governance", email: "alice.governance@example.com" })
    .expect(201);

  const position = await request(app)
    .post("/api/v1/h2r/positions")
    .set(headers)
    .send({ title: "Finance Controller", department: "Finance", authorityDomain: "R2R", authorityTier: 3 })
    .expect(201);

  const assignment = await request(app)
    .post("/api/v1/h2r/assignments")
    .set(headers)
    .send({ employeeId: employee.body.employee_id, positionId: position.body.position_id })
    .expect(201);

  const credential = await request(app)
    .post("/api/v1/h2r/credentials")
    .set(headers)
    .send({
      employeeId: employee.body.employee_id,
      type: "FinancialApproval",
      expiryDate: "2027-12-31"
    })
    .expect(201);

  const authorityRule = await request(app)
    .post("/api/v1/h2r/authority-rules")
    .set(headers)
    .send({ domain: "R2R", threshold: 10000, requiredTier: 3 })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/activate`)
    .set(headers)
    .expect(200);

  const onLeave = await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/leave`)
    .set(headers)
    .expect(200);

  const returned = await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/return`)
    .set(headers)
    .expect(200);

  const terminated = await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/terminate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/h2r/assignments/${assignment.body.assignment_id}/activate`)
    .set(headers)
    .expect(200);

  const endedAssignment = await request(app)
    .post(`/api/v1/h2r/assignments/${assignment.body.assignment_id}/end`)
    .set(headers)
    .expect(200);

  const expiredCredential = await request(app)
    .post(`/api/v1/h2r/credentials/${credential.body.credential_id}/expire`)
    .set(headers)
    .expect(200);

  assert.equal(employee.body.status, "Candidate");
  assert.equal(position.body.authority_domain, "R2R");
  assert.equal(assignment.body.state, "Planned");
  assert.equal(credential.body.status, "Valid");
  assert.equal(authorityRule.body.domain, "R2R");
  assert.equal(onLeave.body.status, "OnLeave");
  assert.equal(returned.body.status, "Active");
  assert.equal(terminated.body.status, "Terminated");
  assert.equal(endedAssignment.body.state, "Completed");
  assert.equal(expiredCredential.body.status, "Expired");
});

test("Table query API returns data for all whitelisted tables", async () => {
  const headers = authHeaders();

  const customer = await request(app)
    .post("/api/v1/o2c/customers")
    .set(headers)
    .send({ customerName: "Table Query Customer", email: "table.query@example.com" })
    .expect(201);

  const tablesResponse = await request(app)
    .get("/api/v1/query/tables")
    .set(headers)
    .expect(200);

  assert.ok(Array.isArray(tablesResponse.body.data));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "o2c_customer"));

  const customersResponse = await request(app)
    .get("/api/v1/query/o2c_customer?limit=5")
    .set(headers)
    .expect(200);

  assert.equal(customersResponse.body.table, "o2c_customer");
  assert.ok(Array.isArray(customersResponse.body.data));
  assert.ok(
    customersResponse.body.data.some(
      (row: { customer_id: string }) => row.customer_id === customer.body.customer_id
    )
  );

  const byIdResponse = await request(app)
    .get(`/api/v1/query/o2c_customer/${customer.body.customer_id}`)
    .set(headers)
    .expect(200);

  assert.equal(byIdResponse.body.primaryKey, "customer_id");
  assert.equal(byIdResponse.body.data.customer_id, customer.body.customer_id);
});
