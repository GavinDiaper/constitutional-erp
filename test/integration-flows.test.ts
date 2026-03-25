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

  await request(app).post(`/api/v1/p2p/purchase-orders/${po.body.po_id}/issue`).set(headers).expect(200);
  await request(app).post(`/api/v1/p2p/purchase-orders/${po.body.po_id}/acknowledge`).set(headers).expect(200);

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
    .post(`/api/v1/p2p/supplier-invoices/${supplierInvoice.body.supplier_invoice_id}/post`)
    .set(headers)
    .expect(200);

  const apPayment = await request(app)
    .post("/api/v1/p2p/ap-payments")
    .set(headers)
    .send({ supplierInvoiceId: supplierInvoice.body.supplier_invoice_id, amount: 0.01 })
    .expect(201);

  const executedPayment = await request(app)
    .post(`/api/v1/p2p/ap-payments/${apPayment.body.ap_payment_id}/execute`)
    .set(headers)
    .expect(200);

  const reconciledPayment = await request(app)
    .post(`/api/v1/p2p/ap-payments/${apPayment.body.ap_payment_id}/reconcile`)
    .set(headers)
    .expect(200);

  assert.equal(executedPayment.body.state, "Executed");
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
