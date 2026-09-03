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

test("App reads auth config at runtime when env values are updated after import", async () => {
  const previous = {
    apiKey: process.env.API_KEY,
    internalAllowlist: process.env.INTERNAL_ALLOWLIST,
    ingressIdHeader: process.env.INGRESS_ID_HEADER,
    ingressIdValue: process.env.INGRESS_ID_VALUE,
    databasePath: process.env.DATABASE_PATH,
  };

  try {
    process.env.API_KEY = "runtime-key";
    process.env.INTERNAL_ALLOWLIST = "127.0.0.1,::1";
    process.env.INGRESS_ID_HEADER = "x-ingress-id";
    process.env.INGRESS_ID_VALUE = "foundation-ingress";
    process.env.DATABASE_PATH = testDbPath;

    const appModule = await import("../src/app");
    const runtimeApp = appModule.createApp();

    const response = await request(runtimeApp)
      .get("/api/v1/query/r2r_ledger_entry?limit=1&offset=0")
      .set({
        "x-api-key": "runtime-key",
        "x-ingress-id": "foundation-ingress",
      })
      .expect(200);

    assert.ok(Array.isArray(response.body.data));
  } finally {
    process.env.API_KEY = previous.apiKey;
    process.env.INTERNAL_ALLOWLIST = previous.internalAllowlist;
    process.env.INGRESS_ID_HEADER = previous.ingressIdHeader;
    process.env.INGRESS_ID_VALUE = previous.ingressIdValue;
    process.env.DATABASE_PATH = previous.databasePath;
  }
});

test("P2P integration flow transitions through canonical lifecycle", async () => {
  const headers = authHeaders();

  const ledgerBefore = await request(app)
    .get("/api/v1/query/r2r_ledger_entry?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const journalsBefore = await request(app)
    .get("/api/v1/query/r2r_journal?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const supplier = await request(app)
    .post("/api/v1/p2p/suppliers")
    .set(headers)
    .send({ supplierName: "Supplier One", email: "ap@supplier.one" })
    .expect(201);

  const requisition = await request(app)
    .post("/api/v1/p2p/requisitions")
    .set(headers)
    .send({ requester: "ops.user", legalEntityId: "LE-SEED-AE" })
    .expect(201);

  const requisitionTaxOptions = await request(app)
    .get(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/tax-options`)
    .set(headers)
    .expect(200);

  assert.ok(Array.isArray(requisitionTaxOptions.body.data));
  assert.ok(requisitionTaxOptions.body.data.some((row: any) => row.taxCodeId === "TCOD-VAT5"));

  const requisitionLine = await request(app)
    .post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/lines`)
    .set(headers)
    .send({ description: "test line", quantity: 2, unitPrice: 125.5, taxCodeId: "TCOD-VAT5" })
    .expect(201);

  assert.equal(requisitionLine.body.requisition.total_amount, 251);
  assert.equal(requisitionLine.body.line.tax_code_id, "TCOD-VAT5");
  assert.equal(requisitionLine.body.line.tax_rate_percent, 5);
  assert.equal(requisitionLine.body.line.tax_amount, 12.55);

  await request(app).post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/submit`).set(headers).expect(200);
  await request(app).post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/approve`).set(headers).expect(200);

  const po = await request(app)
    .post(`/api/v1/p2p/requisitions/${requisition.body.requisition_id}/convert`)
    .set(headers)
    .send({ supplierId: supplier.body.supplier_id })
    .expect(201);

  assert.equal(po.body.legal_entity_id, "LE-SEED-AE");

  const poLines = await request(app)
    .get(`/api/v1/p2p/purchase-orders/${po.body.po_id}/lines`)
    .set(headers)
    .expect(200);

  assert.equal(poLines.body.data.length, 1);
  assert.equal(poLines.body.data[0].tax_code_id, "TCOD-VAT5");
  assert.equal(poLines.body.data[0].tax_rate_percent, 5);
  assert.equal(poLines.body.data[0].tax_amount, 12.55);

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
    .send({ supplierInvoiceId: supplierInvoice.body.supplier_invoice_id, amount: supplierInvoice.body.amount_due })
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
  assert.ok(Number(invoiceAfterPayment.body.amount_paid) >= Number(invoiceAfterPayment.body.amount_due));

  const ledgerAfter = await request(app)
    .get("/api/v1/query/r2r_ledger_entry?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const journalsAfter = await request(app)
    .get("/api/v1/query/r2r_journal?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const ledgerDelta = ledgerAfter.body.data.length - ledgerBefore.body.data.length;
  const journalDelta = journalsAfter.body.data.length - journalsBefore.body.data.length;

  assert.equal(journalDelta, 2);
  assert.equal(ledgerDelta, 4);
});

test("O2C shipping creates shipment records for diagram visibility", async () => {
  const headers = authHeaders();

  const customer = await request(app)
    .post("/api/v1/o2c/customers")
    .set(headers)
    .send({ customerName: "Diagram O2C Customer", email: "diagram.o2c@example.com" })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/customers/${customer.body.customer_id}/activate`)
    .set(headers)
    .expect(200);

  const quote = await request(app)
    .post("/api/v1/o2c/quotes")
    .set(headers)
    .send({ customerId: customer.body.customer_id, currencyCode: "USD", legalEntityId: "LE-SEED-US" })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/lines`)
    .set(headers)
    .send({ sku: "SKU-DIAGRAM-1", quantity: 1, unitPrice: 100 })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/send`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/accept`)
    .set(headers)
    .expect(200);

  const order = await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/convert`)
    .set(headers)
    .send({})
    .expect(201);

  assert.equal(order.body.legal_entity_id, "LE-SEED-US");

  await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/confirm`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/allocate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/ship`)
    .set(headers)
    .expect(200);

  const shipments = await request(app)
    .get(`/api/v1/query/o2c_shipment?limit=1000&offset=0`)
    .set(headers)
    .expect(200);

  const orderShipments = (shipments.body.data as Array<Record<string, unknown>>).filter(
    (row) => row.order_id === order.body.order_id
  );

  assert.ok(orderShipments.length > 0);
  assert.equal(orderShipments[0]?.state, "Shipped");
});

test("O2C customer hypermedia exposes activate link while Draft", async () => {
  const headers = authHeaders();

  const customer = await request(app)
    .post("/api/v1/o2c/customers")
    .set(headers)
    .send({ customerName: "Draft Link Customer", email: "draft.link@example.com" })
    .expect(201);

  assert.equal(customer.body.status, "Draft");
  assert.ok(customer.body._links?.activate);
  assert.equal(customer.body._links.activate?.href, `/api/v1/o2c/customers/${customer.body.customer_id}/activate`);

  const customerById = await request(app)
    .get(`/api/v1/o2c/customers/${customer.body.customer_id}`)
    .set(headers)
    .expect(200);

  assert.ok(customerById.body._links?.activate);

  const activated = await request(app)
    .post(`/api/v1/o2c/customers/${customer.body.customer_id}/activate`)
    .set(headers)
    .expect(200);

  assert.equal(activated.body.status, "Active");
  assert.equal(activated.body._links?.activate, undefined);
});

test("O2C payment registration auto-applies invoice and posts accounting entries", async () => {
  const headers = authHeaders();

  const ledgerBefore = await request(app)
    .get("/api/v1/query/r2r_ledger_entry?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const journalsBefore = await request(app)
    .get("/api/v1/query/r2r_journal?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const customer = await request(app)
    .post("/api/v1/o2c/customers")
    .set(headers)
    .send({ customerName: "Auto Apply Customer", email: "auto.apply@example.com" })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/customers/${customer.body.customer_id}/activate`)
    .set(headers)
    .expect(200);

  const quote = await request(app)
    .post("/api/v1/o2c/quotes")
    .set(headers)
    .send({ customerId: customer.body.customer_id, currencyCode: "USD", legalEntityId: "LE-SEED-US" })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/lines`)
    .set(headers)
    .send({ sku: "SKU-PAYMENT-1", quantity: 1, unitPrice: 10 })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/send`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/accept`)
    .set(headers)
    .expect(200);

  const order = await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/convert`)
    .set(headers)
    .send({})
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/confirm`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/allocate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/ship`)
    .set(headers)
    .expect(200);

  const invoice = await request(app)
    .post(`/api/v1/o2c/orders/${order.body.order_id}/generate-invoice`)
    .set(headers)
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/invoices/${invoice.body.invoice_id}/post`)
    .set(headers)
    .expect(200);

  const payment = await request(app)
    .post("/api/v1/o2c/payments")
    .set(headers)
    .send({ invoiceId: invoice.body.invoice_id, amount: 10 })
    .expect(201);

  assert.equal(payment.body.state, "Applied");

  const invoiceAfterPayment = await request(app)
    .get(`/api/v1/o2c/invoices/${invoice.body.invoice_id}`)
    .set(headers)
    .expect(200);

  assert.equal(invoiceAfterPayment.body.state, "Paid");
  assert.ok(Number(invoiceAfterPayment.body.amount_paid) >= Number(invoiceAfterPayment.body.amount_due));

  const idempotentApply = await request(app)
    .post(`/api/v1/o2c/payments/${payment.body.payment_id}/apply`)
    .set(headers)
    .expect(200);

  assert.equal(idempotentApply.body.state, "Applied");

  const reconciled = await request(app)
    .post(`/api/v1/o2c/payments/${payment.body.payment_id}/reconcile`)
    .set(headers)
    .expect(200);

  assert.equal(reconciled.body.state, "Reconciled");

  const ledgerAfter = await request(app)
    .get("/api/v1/query/r2r_ledger_entry?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const journalsAfter = await request(app)
    .get("/api/v1/query/r2r_journal?limit=1000&offset=0")
    .set(headers)
    .expect(200);

  const ledgerDelta = ledgerAfter.body.data.length - ledgerBefore.body.data.length;
  const journalDelta = journalsAfter.body.data.length - journalsBefore.body.data.length;

  assert.equal(journalDelta, 1);
  assert.equal(ledgerDelta, 2);
});

test("R2R integration flow enforces period lifecycle and posting rules", async () => {
  const headers = authHeaders();

  const cashAccount = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "1100", accountName: "Cash on Hand", accountType: "Asset" })
    .expect(201);

  const equityAccount = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "3100", accountName: "Owner Equity", accountType: "Equity" })
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
    .send({ accountId: cashAccount.body.account_id, debitAmount: 10, creditAmount: 0, memo: "opening debit" })
    .expect(201);

  await request(app)
    .post(`/api/v1/r2r/journals/${journal.body.journal_id}/lines`)
    .set(headers)
    .send({ accountId: equityAccount.body.account_id, debitAmount: 0, creditAmount: 10, memo: "opening credit" })
    .expect(201);

  const postedJournal = await request(app)
    .post(`/api/v1/r2r/journals/${journal.body.journal_id}/post`)
    .set(headers)
    .expect(200);

  assert.equal(postedJournal.body.state, "Posted");

  const trialBalance = await request(app)
    .get(`/api/v1/r2r/trial-balance/${fiscalPeriod.body.fiscal_period_id}`)
    .set(headers)
    .expect(200);

  assert.ok(Array.isArray(trialBalance.body.data));
  assert.ok(trialBalance.body.data.length > 0);

  const trialBalanceRows = await request(app)
    .get(`/api/v1/query/r2r_trial_balance_row?limit=500&offset=0`)
    .set(headers)
    .expect(200);

  const rowsForPeriod = (trialBalanceRows.body.data as Array<Record<string, unknown>>).filter(
    (row) => row.fiscal_period_id === fiscalPeriod.body.fiscal_period_id
  );

  assert.ok(rowsForPeriod.length > 0);

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

test("R2R rejects unbalanced journals during posting", async () => {
  const headers = authHeaders();

  const account = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "1200", accountName: "Bank Account", accountType: "Asset" })
    .expect(201);

  const fiscalYear = await request(app)
    .post("/api/v1/r2r/fiscal-years")
    .set(headers)
    .send({ yearLabel: "FY2028", startDate: "2028-01-01", endDate: "2028-12-31" })
    .expect(201);

  const fiscalPeriod = await request(app)
    .post("/api/v1/r2r/fiscal-periods")
    .set(headers)
    .send({
      fiscalYearId: fiscalYear.body.fiscal_year_id,
      periodNumber: 1,
      startDate: "2028-01-01",
      endDate: "2028-01-31"
    })
    .expect(201);

  const journal = await request(app)
    .post("/api/v1/r2r/journals")
    .set(headers)
    .send({ fiscalPeriodId: fiscalPeriod.body.fiscal_period_id, description: "Unbalanced entry" })
    .expect(201);

  await request(app)
    .post(`/api/v1/r2r/journals/${journal.body.journal_id}/lines`)
    .set(headers)
    .send({ accountId: account.body.account_id, debitAmount: 25, creditAmount: 0 })
    .expect(201);

  const postAttempt = await request(app)
    .post(`/api/v1/r2r/journals/${journal.body.journal_id}/post`)
    .set(headers)
    .expect(409);

  assert.equal(postAttempt.body.title, "unbalanced_journal");
});

test("R2R account type validation and starter COA seeding are enforced", async () => {
  const headers = authHeaders();

  const invalidTypeResponse = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "9999", accountName: "Invalid", accountType: "Contra" })
    .expect(400);

  assert.equal(invalidTypeResponse.body.title, "invalid_request");

  const accountsResponse = await request(app)
    .get("/api/v1/r2r/accounts")
    .set(headers)
    .expect(200);

  const accountTypes = new Set(
    accountsResponse.body.data.map((row: { account_type: string }) => row.account_type)
  );
  const accountRows = accountsResponse.body.data as Array<{ account_code: string; ledger_id: string | null }>;
  const accountCodes = new Set(accountRows.map((row) => row.account_code));

  assert.ok(accountCodes.has("SYS-100-ASSET-CASH"));
  assert.ok(accountCodes.has("SYS-110-ASSET-AR"));
  assert.ok(accountCodes.has("SYS-200-LIAB-AP"));
  assert.ok(accountCodes.has("SYS-300-EQ-RE"));
  assert.ok(accountCodes.has("SYS-400-REV-SALES"));
  assert.ok(accountCodes.has("SYS-500-EXP-COGS"));
  assert.ok(accountCodes.has("SYS-510-EXP-OPEX"));

  const cashAccount = accountRows.find((row) => row.account_code === "SYS-100-ASSET-CASH");
  assert.equal(cashAccount?.ledger_id, "LGR-SEED-US");

  assert.ok(accountTypes.has("Asset"));
  assert.ok(accountTypes.has("Liability"));
  assert.ok(accountTypes.has("Equity"));
  assert.ok(accountTypes.has("Revenue"));
  assert.ok(accountTypes.has("Expense"));
});

test("R2R bootstrap seeds default legal entities and ledgers", async () => {
  const headers = authHeaders();

  const legalEntities = await request(app)
    .get("/api/v1/r2r/legal-entities")
    .set(headers)
    .expect(200);

  const legalEntityRows = legalEntities.body.data as Array<{
    legal_entity_id: string;
    name: string;
    currency_code: string;
  }>;

  const seededUsLegalEntity = legalEntityRows.find((row) => row.legal_entity_id === "LE-SEED-US");
  const seededAuLegalEntity = legalEntityRows.find((row) => row.legal_entity_id === "LE-SEED-AU");
  const seededAeLegalEntity = legalEntityRows.find((row) => row.legal_entity_id === "LE-SEED-AE");

  assert.equal(seededUsLegalEntity?.name, "Constitutional Holdings US");
  assert.equal(seededUsLegalEntity?.currency_code, "USD");
  assert.equal(seededAuLegalEntity?.name, "Constitutional Holdings AU");
  assert.equal(seededAuLegalEntity?.currency_code, "AUD");
  assert.equal(seededAeLegalEntity?.name, "Constitutional Holdings UAE");
  assert.equal(seededAeLegalEntity?.currency_code, "AED");

  const ledgers = await request(app)
    .get("/api/v1/r2r/ledgers")
    .set(headers)
    .expect(200);

  const ledgerRows = ledgers.body.data as Array<{
    ledger_id: string;
    legal_entity_id: string | null;
    currency_code: string;
  }>;

  const seededUsLedger = ledgerRows.find((row) => row.ledger_id === "LGR-SEED-US");
  const seededAuLedger = ledgerRows.find((row) => row.ledger_id === "LGR-SEED-AU");
  const seededAeLedger = ledgerRows.find((row) => row.ledger_id === "LGR-SEED-AE");

  assert.equal(seededUsLedger?.legal_entity_id, "LE-SEED-US");
  assert.equal(seededUsLedger?.currency_code, "USD");
  assert.equal(seededAuLedger?.legal_entity_id, "LE-SEED-AU");
  assert.equal(seededAuLedger?.currency_code, "AUD");
  assert.equal(seededAeLedger?.legal_entity_id, "LE-SEED-AE");
  assert.equal(seededAeLedger?.currency_code, "AED");
});

test("R2R supports COA segment definitions and account hierarchy", async () => {
  const headers = authHeaders();

  const segmentDefinition = await request(app)
    .post("/api/v1/r2r/accounts/segment-definitions")
    .set(headers)
    .send({
      code: "COST_CENTER",
      name: "Cost Center",
      sortOrder: 1,
      isRequired: true
    })
    .expect(201);

  const parentAccount = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "2001", accountName: "Operating Expense Parent", accountType: "Expense" })
    .expect(201);

  const childAccount = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({
      accountCode: "2002",
      accountName: "Operating Expense Child",
      accountType: "Expense",
      parentAccountId: parentAccount.body.account_id
    })
    .expect(201);

  const setSegments = await request(app)
    .put(`/api/v1/r2r/accounts/${childAccount.body.account_id}/segments`)
    .set(headers)
    .send({
      values: [
        {
          segmentDefinitionId: segmentDefinition.body.segment_definition_id,
          value: "CC-100"
        }
      ]
    })
    .expect(200);

  assert.equal(setSegments.body.data[0].segment_value, "CC-100");

  const hierarchy = await request(app)
    .get("/api/v1/r2r/accounts/hierarchy")
    .set(headers)
    .expect(200);

  const parentNode = hierarchy.body.data.find(
    (row: { account_id: string }) => row.account_id === parentAccount.body.account_id
  );

  assert.ok(parentNode);
  assert.ok(
    parentNode.children.some(
      (row: { account_id: string }) => row.account_id === childAccount.body.account_id
    )
  );

  const definitions = await request(app)
    .get("/api/v1/r2r/accounts/segment-definitions")
    .set(headers)
    .expect(200);

  assert.ok(
    definitions.body.data.some(
      (row: { segment_definition_id: string }) =>
        row.segment_definition_id === segmentDefinition.body.segment_definition_id
    )
  );
});

test("R2R supports COA combination rule validation", async () => {
  const headers = authHeaders();

  const regionSegment = await request(app)
    .post("/api/v1/r2r/accounts/segment-definitions")
    .set(headers)
    .send({ code: "REGION", name: "Region", sortOrder: 10, isRequired: true })
    .expect(201);

  const departmentSegment = await request(app)
    .post("/api/v1/r2r/accounts/segment-definitions")
    .set(headers)
    .send({ code: "DEPARTMENT", name: "Department", sortOrder: 11, isRequired: true })
    .expect(201);

  const rule = await request(app)
    .post("/api/v1/r2r/accounts/combination-rules")
    .set(headers)
    .send({
      name: "AU-FIN-ONLY",
      conditions: [
        { segmentDefinitionId: regionSegment.body.segment_definition_id, expectedValue: "AU" },
        { segmentDefinitionId: departmentSegment.body.segment_definition_id, expectedValue: "FIN" }
      ]
    })
    .expect(201);

  const valid = await request(app)
    .post("/api/v1/r2r/accounts/combination-rules/validate")
    .set(headers)
    .send({
      values: [
        { segmentDefinitionId: regionSegment.body.segment_definition_id, value: "AU" },
        { segmentDefinitionId: departmentSegment.body.segment_definition_id, value: "FIN" }
      ]
    })
    .expect(200);

  assert.equal(valid.body.valid, true);
  assert.equal(valid.body.matchedRuleId, rule.body.rule_id);

  const invalid = await request(app)
    .post("/api/v1/r2r/accounts/combination-rules/validate")
    .set(headers)
    .send({
      values: [
        { segmentDefinitionId: regionSegment.body.segment_definition_id, value: "US" },
        { segmentDefinitionId: departmentSegment.body.segment_definition_id, value: "FIN" }
      ]
    })
    .expect(200);

  assert.equal(invalid.body.valid, false);
  assert.ok(Array.isArray(invalid.body.violations));
});

test("R2R supports FX rate type and rate lookup APIs", async () => {
  const headers = authHeaders();

  const rateType = await request(app)
    .post("/api/v1/r2r/fx/rate-types")
    .set(headers)
    .send({ code: "CORP", name: "Corporate" })
    .expect(201);

  await request(app)
    .post("/api/v1/r2r/fx/rates")
    .set(headers)
    .send({
      rateTypeId: rateType.body.rate_type_id,
      fromCurrency: "USD",
      toCurrency: "AUD",
      rate: 1.53,
      validFrom: "2026-04-01T00:00:00.000Z"
    })
    .expect(201);

  const latest = await request(app)
    .get(
      `/api/v1/r2r/fx/rates/latest?rateTypeId=${rateType.body.rate_type_id}&fromCurrency=USD&toCurrency=AUD&asOf=2026-04-02T00:00:00.000Z`
    )
    .set(headers)
    .expect(200);

  assert.equal(latest.body.from_currency, "USD");
  assert.equal(latest.body.to_currency, "AUD");
  assert.equal(latest.body.rate, 1.53);
});

test("R2R supports SLA posting profile starter APIs", async () => {
  const headers = authHeaders();

  const debitAccount = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "8100", accountName: "Accounts Receivable", accountType: "Asset" })
    .expect(201);

  const creditAccount = await request(app)
    .post("/api/v1/r2r/accounts")
    .set(headers)
    .send({ accountCode: "9100", accountName: "Revenue", accountType: "Revenue" })
    .expect(201);

  const profile = await request(app)
    .post("/api/v1/r2r/sla/posting-profiles")
    .set(headers)
    .send({
      name: "O2C Invoice Posted",
      eventType: "o2c.invoice.posted",
      lines: [
        {
          entrySide: "debit",
          accountId: debitAccount.body.account_id,
          amountSource: "grossAmount",
          taxCode: "VAT5",
          taxApplicability: "taxable",
          taxAccountRole: "tax_recoverable"
        },
        {
          entrySide: "credit",
          accountId: creditAccount.body.account_id,
          amountSource: "grossAmount",
          taxCode: "VAT5",
          taxApplicability: "taxable",
          taxAccountRole: "tax_liability"
        }
      ]
    })
    .expect(201);

  assert.equal(profile.body.lines.length, 2);
  assert.equal(profile.body.lines[0].tax_code, "VAT5");
  assert.equal(profile.body.lines[0].tax_applicability, "taxable");
  assert.equal(profile.body.lines[1].tax_account_role, "tax_liability");

  const deactivated = await request(app)
    .post(`/api/v1/r2r/sla/posting-profiles/${profile.body.posting_profile_id}/deactivate`)
    .set(headers)
    .expect(200);

  assert.equal(deactivated.body.is_active, 0);
});

test("R2R legal entities can be created and linked to ledgers", async () => {
  const headers = authHeaders();

  const legalEntity = await request(app)
    .post("/api/v1/r2r/legal-entities")
    .set(headers)
    .send({
      name: "Constitutional Holdings AU",
      currencyCode: "AUD",
      locale: "en-AU"
    })
    .expect(201);

  const ledger = await request(app)
    .post("/api/v1/r2r/ledgers")
    .set(headers)
    .send({
      name: "Primary AU Ledger",
      currencyCode: "AUD",
      legalEntityId: legalEntity.body.legal_entity_id
    })
    .expect(201);

  assert.equal(ledger.body.legal_entity_id, legalEntity.body.legal_entity_id);

  const fetched = await request(app)
    .get(`/api/v1/r2r/legal-entities/${legalEntity.body.legal_entity_id}`)
    .set(headers)
    .expect(200);

  assert.equal(fetched.body.name, "Constitutional Holdings AU");
});

test("R2R ledger sets can group ledgers", async () => {
  const headers = authHeaders();

  const legalEntity = await request(app)
    .post("/api/v1/r2r/legal-entities")
    .set(headers)
    .send({
      name: "Constitutional Services NZ",
      currencyCode: "NZD"
    })
    .expect(201);

  const ledger = await request(app)
    .post("/api/v1/r2r/ledgers")
    .set(headers)
    .send({
      name: "Primary NZ Ledger",
      currencyCode: "NZD",
      legalEntityId: legalEntity.body.legal_entity_id
    })
    .expect(201);

  const ledgerSet = await request(app)
    .post("/api/v1/r2r/ledger-sets")
    .set(headers)
    .send({ name: "ANZ Group Ledger Set" })
    .expect(201);

  await request(app)
    .post(`/api/v1/r2r/ledger-sets/${ledgerSet.body.ledger_set_id}/members`)
    .set(headers)
    .send({ ledgerId: ledger.body.ledger_id })
    .expect(201);

  const members = await request(app)
    .get(`/api/v1/r2r/ledger-sets/${ledgerSet.body.ledger_set_id}/members`)
    .set(headers)
    .expect(200);

  assert.ok(
    members.body.data.some(
      (row: { ledger_id: string }) => row.ledger_id === ledger.body.ledger_id
    )
  );
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
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_legal_entity"));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_ledger"));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_coa_segment_definition"));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_coa_combination_rule"));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_fx_rate_type"));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_fx_rate"));
  assert.ok(tablesResponse.body.data.some((row: { name: string }) => row.name === "r2r_sla_posting_profile"));

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

test("Projects API persists WBS context", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Project WH ${unique}` })
    .expect(201);

  const created = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: "WBS Linked Project",
      projectType: "Internal",
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-WBS-1",
      organizationId: organization.body.organization_id,
      wbsId: `WBS-${unique}`
    })
    .expect(201);

  assert.equal(created.body.success, true);
  assert.equal(created.body.data.wbsId, `WBS-${unique}`);

  const fetched = await request(app)
    .get(`/api/v1/projects/${created.body.data.projectId}`)
    .set(headers)
    .expect(200);

  assert.equal(fetched.body.success, true);
  assert.equal(fetched.body.data.wbsId, `WBS-${unique}`);
});

test("Projects API requires service contracts and WBS for Service projects", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Service Project Org ${unique}` })
    .expect(201);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({
      name: `Service PM ${unique}`,
      email: `svc.pm.${unique}@example.com`
    })
    .expect(201);

  const invalid = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: "Service Project Without Contract",
      projectType: "Service",
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: employee.body.employee_id,
      organizationId: organization.body.organization_id,
    })
    .expect(400);

  assert.match(invalid.body.error, /contractId.*required|wbsId.*required/i);

  const created = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: "Service Project With Contract",
      projectType: "Service",
      contractId: `CON-${unique}`,
      wbsId: `WBS-SVC-${unique}`,
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: employee.body.employee_id,
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  assert.equal(created.body.success, true);
  assert.equal(created.body.data.contractId, `CON-${unique}`);
  assert.equal(created.body.data.wbsId, `WBS-SVC-${unique}`);
});

test("Sales order lines persist project and WBS mapping for service contract orders", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Service Mapping Org ${unique}` })
    .expect(201);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({
      name: `Service Mapping PM ${unique}`,
      email: `svc.mapping.${unique}@example.com`
    })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Service Project Mapping ${unique}`,
      projectType: "Service",
      contractId: `CON-LINE-${unique}`,
      wbsId: `WBS-LINE-${unique}`,
      budgetAmount: 12000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: employee.body.employee_id,
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  const customer = await request(app)
    .post("/api/v1/o2c/customers")
    .set(headers)
    .send({ customerName: `Service Order Customer ${unique}`, email: `svc.order.${unique}@example.com` })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/customers/${customer.body.customer_id}/activate`)
    .set(headers)
    .expect(200);

  const quote = await request(app)
    .post("/api/v1/o2c/quotes")
    .set(headers)
    .send({
      customerId: customer.body.customer_id,
      currencyCode: "USD",
      legalEntityId: "LE-SEED-US",
      projectId: project.body.data.projectId
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/lines`)
    .set(headers)
    .send({ sku: "SKU-SVC-ORDER-1", quantity: 1, unitPrice: 2500 })
    .expect(201);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/send`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/accept`)
    .set(headers)
    .expect(200);

  const order = await request(app)
    .post(`/api/v1/o2c/quotes/${quote.body.quote_id}/convert`)
    .set(headers)
    .send({ projectId: project.body.data.projectId, wbsId: project.body.data.wbsId })
    .expect(201);

  const lines = await request(app)
    .get(`/api/v1/o2c/orders/${order.body.order_id}/lines`)
    .set(headers)
    .expect(200);

  assert.equal(lines.body.data.length, 1);
  assert.equal(lines.body.data[0].project_id, project.body.data.projectId);
  assert.equal(lines.body.data[0].wbs_id, project.body.data.wbsId);
});

test("Project task tracking decrements remaining hours when labor is posted", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Task Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Task Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-TASK-MGR",
      organizationId: organization.body.organization_id,
      wbsId: `WBS-TASK-${unique}`
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const task = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .send({
      name: `Task ${unique}`,
      description: "Implementation task",
      estimatedHours: 16,
      remainingHours: 16,
      assignedTo: "EMP-TASK-MGR"
    })
    .expect(201);

  assert.equal(task.body.data.remainingHours, 16);

  const labor = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/log-hours`)
    .set(headers)
    .send({
      hours: 6,
      resourceId: "EMP-TASK-MGR",
      rate: 75,
      costElementId: "COST-LABOR-PRIMARY"
    })
    .expect(201);

  assert.equal(labor.body.data.task.remainingHours, 10);
  assert.equal(labor.body.data.task.actualHours, 6);
  assert.equal(labor.body.data.task.percentComplete, 37.5);
});

test("Project task resource allocation prevents over-allocating the same employee", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Resource Org ${unique}` })
    .expect(201);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({
      name: `Resource Employee ${unique}`,
      email: `resource.${unique}@example.com`,
      active: true,
    })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Resource Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: employee.body.employee_id,
      organizationId: organization.body.organization_id,
      wbsId: `WBS-RESOURCE-${unique}`,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const task = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .send({
      name: `Planned Task ${unique}`,
      description: "Resource scheduling task",
      estimatedHours: 40,
      remainingHours: 40,
      assignedTo: employee.body.employee_id,
    })
    .expect(201);

  const firstAllocation = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
    .set(headers)
    .send({
      resourceId: employee.body.employee_id,
      resourceType: "employee",
      role: "Engineer",
      allocatedHours: 24,
    })
    .expect(201);

  assert.equal(firstAllocation.body.data.resourceId, employee.body.employee_id);
  assert.equal(firstAllocation.body.data.allocatedHours, 24);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
    .set(headers)
    .send({
      resourceId: employee.body.employee_id,
      resourceType: "employee",
      role: "Engineer",
      allocatedHours: 20,
    })
    .expect(409);
});

test("Project financial summary calculates cost-to-cost completion and margin", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Finance Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Finance Project ${unique}`,
      projectType: "Service",
      contractId: `CON-FIN-${unique}`,
      wbsId: `WBS-FIN-${unique}`,
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-FIN-MGR",
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/labor-entries`)
    .set(headers)
    .send({
      resourceId: "EMP-FIN-MGR",
      hours: 10,
      rate: 75,
      costElementId: "COST-LABOR-PRIMARY",
    })
    .expect(201);

  const summary = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}/financial-summary`)
    .set(headers)
    .expect(200);

  assert.equal(summary.body.data.actualCostAmount, 750);
  assert.equal(summary.body.data.percentComplete, 75);
  assert.equal(summary.body.data.recognizedRevenue, 750);
  assert.equal(summary.body.data.grossMargin, 0);
});

test("Project revenue recognition recognizes approved milestone billing before fallback cost-to-cost completion", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Revenue Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Revenue Project ${unique}`,
      projectType: "Service",
      contractId: `CON-REV-${unique}`,
      wbsId: `WBS-REV-${unique}`,
      budgetAmount: 12000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-REV-MGR",
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const milestone = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones`)
    .set(headers)
    .send({
      name: `Milestone A ${unique}`,
      phaseName: "Phase 1",
      billingAmount: 3000,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/stage-gates`)
    .set(headers)
    .send({
      phaseName: "Phase 1",
      requiredSignoffs: ["Project Manager", "Finance"],
      approvals: ["Project Manager", "Finance"],
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones/${milestone.body.data.milestoneId}/approve`)
    .set(headers)
    .expect(200);

  const summary = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}/financial-summary`)
    .set(headers)
    .expect(200);

  assert.equal(summary.body.data.recognizedRevenue, 3000);
  assert.equal(summary.body.data.grossMargin, 3000);
});

test("Project profitability ledger tracks deferred WIP against milestone revenue", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Profitability Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Profitability Project ${unique}`,
      projectType: "Service",
      contractId: `CON-PROF-${unique}`,
      wbsId: `WBS-PROF-${unique}`,
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-PROF-MGR",
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/labor-entries`)
    .set(headers)
    .send({
      resourceId: "EMP-PROF-MGR",
      hours: 10,
      rate: 80,
      costElementId: "COST-LABOR-PRIMARY",
    })
    .expect(201);

  const milestone = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones`)
    .set(headers)
    .send({
      name: `Milestone B ${unique}`,
      phaseName: "Phase 2",
      billingAmount: 600,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/stage-gates`)
    .set(headers)
    .send({
      phaseName: "Phase 2",
      requiredSignoffs: ["Project Manager"],
      approvals: ["Project Manager"],
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones/${milestone.body.data.milestoneId}/approve`)
    .set(headers)
    .expect(200);

  const profitability = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}/profitability`)
    .set(headers)
    .expect(200);

  assert.equal(profitability.body.data.actualCostAmount, 800);
  assert.equal(profitability.body.data.percentComplete, 16);
  assert.equal(profitability.body.data.recognizedRevenue, 600);
  assert.equal(profitability.body.data.deferredRevenue, 200);
  assert.equal(profitability.body.data.grossMargin, -200);
});

test("Project governance stage-gates require sign-offs and track risk exposure", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Governance Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Governance Project ${unique}`,
      projectType: "Service",
      contractId: `CON-GOV-${unique}`,
      wbsId: `WBS-GOV-${unique}`,
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-GOV-MGR",
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const risk = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/risks`)
    .set(headers)
    .send({
      title: `Delivery risk ${unique}`,
      probabilityPercent: 25,
      impactAmount: 2000,
    })
    .expect(201);

  assert.equal(risk.body.data.financialExposure, 500);

  const gate = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/stage-gates`)
    .set(headers)
    .send({
      phaseName: "Phase 2",
      requiredSignoffs: ["Project Manager", "Finance"],
      approvals: ["Project Manager"],
    })
    .expect(201);

  assert.equal(gate.body.data.isReady, false);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/advance-phase`)
    .set(headers)
    .send({ phaseName: "Phase 2" })
    .expect(409);

  const cleared = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/stage-gates`)
    .set(headers)
    .send({
      phaseName: "Phase 2",
      requiredSignoffs: ["Project Manager", "Finance"],
      approvals: ["Project Manager", "Finance"],
    })
    .expect(200);

  assert.equal(cleared.body.data.isReady, true);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/advance-phase`)
    .set(headers)
    .send({ phaseName: "Phase 2" })
    .expect(200);
});

test("Project change control records a revised budget without overwriting the original baseline", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Change Control Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Change Control Project ${unique}`,
      projectType: "Service",
      contractId: `CON-CC-${unique}`,
      wbsId: `WBS-CC-${unique}`,
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-CC-MGR",
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  const changeRequest = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/change-requests`)
    .set(headers)
    .send({
      title: `Scope expansion ${unique}`,
      description: "Add additional implementation work",
      deltaBudgetAmount: 1200,
    })
    .expect(201);

  assert.equal(changeRequest.body.data.originalBudgetAmount, 5000);
  assert.equal(changeRequest.body.data.deltaBudgetAmount, 1200);
  assert.equal(changeRequest.body.data.revisedBudgetAmount, 6200);

  const approved = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/change-requests/${changeRequest.body.data.changeRequestId}/approve`)
    .set(headers)
    .expect(200);

  assert.equal(approved.body.data.status, "Approved");

  const refreshed = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}`)
    .set(headers)
    .expect(200);

  assert.equal(refreshed.body.data.budgetAmount, 6200);
  assert.equal(refreshed.body.data.baselineBudgetAmount, 5000);
});

test("Project milestone billing requires a ready gate before a phase can be approved for billing", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Milestone Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Milestone Project ${unique}`,
      projectType: "Service",
      contractId: `CON-MILESTONE-${unique}`,
      wbsId: `WBS-MILESTONE-${unique}`,
      budgetAmount: 10000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-MILESTONE-MGR",
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const milestone = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones`)
    .set(headers)
    .send({
      name: `Phase 2 milestone ${unique}`,
      phaseName: "Phase 2",
      billingAmount: 2500,
    })
    .expect(201);

  assert.equal(milestone.body.data.status, "Planned");

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/stage-gates`)
    .set(headers)
    .send({
      phaseName: "Phase 2",
      requiredSignoffs: ["Project Manager", "Finance"],
      approvals: ["Project Manager"],
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones/${milestone.body.data.milestoneId}/approve`)
    .set(headers)
    .expect(409);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/stage-gates`)
    .set(headers)
    .send({
      phaseName: "Phase 2",
      requiredSignoffs: ["Project Manager", "Finance"],
      approvals: ["Project Manager", "Finance"],
    })
    .expect(200);

  const approved = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/milestones/${milestone.body.data.milestoneId}/approve`)
    .set(headers)
    .expect(200);

  assert.equal(approved.body.data.status, "Approved");
  assert.equal(approved.body.data.readyForBilling, true);
  assert.equal(approved.body.data.billingAmount, 2500);
});

test("Project progress summarizes task completion against budgeted hours", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Progress Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Progress Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-TASK-MGR",
      organizationId: organization.body.organization_id,
      wbsId: `WBS-PROGRESS-${unique}`,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const task = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .send({
      name: `Progress Task ${unique}`,
      description: "Progress tracking task",
      estimatedHours: 16,
      remainingHours: 16,
      assignedTo: "EMP-TASK-MGR",
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/log-hours`)
    .set(headers)
    .send({
      hours: 6,
      resourceId: "EMP-TASK-MGR",
      rate: 75,
      costElementId: "COST-LABOR-PRIMARY",
    })
    .expect(201);

  const progress = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}/progress`)
    .set(headers)
    .expect(200);

  assert.equal(progress.body.data.percentComplete, 37.5);
  assert.equal(progress.body.data.actualHours, 6);
  assert.equal(progress.body.data.estimatedHours, 16);
});

test("Project task allocation enforces required skills and daily availability", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Resource Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Resource Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-RESOURCE-MANAGER",
      organizationId: organization.body.organization_id,
      wbsId: `WBS-RESOURCE-${unique}`,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({ name: `Resource Person ${unique}`, email: `resource.${unique}@example.com` })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/activate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/skills`)
    .set(headers)
    .send({ skillName: "Project Planning", proficiency: "Advanced" })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/availability`)
    .set(headers)
    .send({ workDate: "2026-08-12", availableHours: 8 })
    .expect(201);

  const task = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .send({
      name: `Resource Task ${unique}`,
      estimatedHours: 12,
      remainingHours: 12,
      requiredSkill: "Project Planning",
    })
    .expect(201);

  const allocation = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
    .set(headers)
    .send({
      resourceId: employee.body.employee_id,
      resourceType: "employee",
      role: "Project Lead",
      allocatedHours: 6,
      skillRequired: "Project Planning",
    })
    .expect(201);

  assert.equal(allocation.body.data.resourceId, employee.body.employee_id);

  const secondEmployee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({ name: `Unavailable Person ${unique}`, email: `unavailable.${unique}@example.com` })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${secondEmployee.body.employee_id}/activate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/h2r/employees/${secondEmployee.body.employee_id}/skills`)
    .set(headers)
    .send({ skillName: "Project Planning", proficiency: "Intermediate" })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${secondEmployee.body.employee_id}/availability`)
    .set(headers)
    .send({ workDate: "2026-08-12", availableHours: 4 })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
    .set(headers)
    .send({
      resourceId: secondEmployee.body.employee_id,
      resourceType: "employee",
      role: "Project Lead",
      allocatedHours: 5,
      skillRequired: "Project Planning",
    })
    .expect(409);
});

test("Project task allocation defaults to the latest employee availability date when no workDate is supplied", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Default Date Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Default Date Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 3000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-RESOURCE-MANAGER",
      organizationId: organization.body.organization_id,
      wbsId: `WBS-DEFAULT-DATE-${unique}`,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({ name: `Default Date Person ${unique}`, email: `defaultdate.${unique}@example.com` })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/activate`)
    .set(headers)
    .expect(200);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/skills`)
    .set(headers)
    .send({ skillName: "Project Planning", proficiency: "Advanced" })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/availability`)
    .set(headers)
    .send({ workDate: "2026-08-10", availableHours: 8 })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/availability`)
    .set(headers)
    .send({ workDate: "2026-08-14", availableHours: 12 })
    .expect(201);

  const task = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .send({
      name: `Default Date Task ${unique}`,
      estimatedHours: 12,
      remainingHours: 12,
      requiredSkill: "Project Planning",
    })
    .expect(201);

  const allocation = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
    .set(headers)
    .send({
      resourceId: employee.body.employee_id,
      resourceType: "employee",
      role: "Project Lead",
      allocatedHours: 6,
      skillRequired: "Project Planning",
    })
    .expect(201);

  assert.equal(allocation.body.data.resourceId, employee.body.employee_id);
  assert.equal(allocation.body.data.workDate, "2026-08-14");
});

test("Timesheet task locking validates assignments and updates remaining project work", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Task Lock Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Task Lock Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: "EMP-TASK-LOCK-MGR",
      organizationId: organization.body.organization_id,
      wbsId: `WBS-TASK-LOCK-${unique}`,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({
      name: `Task Lock Employee ${unique}`,
      email: `tasklock.${unique}@example.com`,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/skills`)
    .set(headers)
    .send({ skillName: "Project Planning", proficiency: "Advanced" })
    .expect(201);

  await request(app)
    .post(`/api/v1/h2r/employees/${employee.body.employee_id}/availability`)
    .set(headers)
    .send({ workDate: "2026-01-02", availableHours: 10 })
    .expect(201);

  const task = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .send({
      name: `Task Lock Task ${unique}`,
      estimatedHours: 12,
      remainingHours: 12,
      assignedTo: employee.body.employee_id,
      requiredSkill: "Project Planning",
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
    .set(headers)
    .send({
      resourceId: employee.body.employee_id,
      resourceType: "employee",
      role: "Engineer",
      allocatedHours: 6,
      skillRequired: "Project Planning",
      workDate: "2026-01-02",
    })
    .expect(201);

  const timesheet = await request(app)
    .post("/api/v1/timesheets")
    .set(headers)
    .send({
      organizationId: organization.body.organization_id,
      employeeId: employee.body.employee_id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
    })
    .expect(201);

  const line = await request(app)
    .post(`/api/v1/timesheets/${timesheet.body.data.timesheetId}/lines`)
    .set(headers)
    .send({
      taskId: task.body.data.taskId,
      projectId: project.body.data.projectId,
      resourceId: employee.body.employee_id,
      resourceType: "employee",
      workDate: "2026-01-02",
      hours: 4,
      costElementId: "COST-LABOR-PRIMARY",
      description: "Task-linked time entry",
    })
    .expect(201);

  assert.equal(line.body.data.taskId, task.body.data.taskId);
  assert.equal(line.body.data.resourceType, "employee");

  const refreshedTask = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}/tasks`)
    .set(headers)
    .expect(200);

  const updatedTask = refreshedTask.body.data.find((entry: any) => entry.taskId === task.body.data.taskId);
  assert.ok(updatedTask);
  assert.equal(updatedTask.actualHours, 4);
  assert.equal(updatedTask.remainingHours, 8);
  assert.equal(updatedTask.percentComplete, 33.33);
});

test("Timesheet API supports contractor vendor-rate entries alongside employee timesheets", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Vendor Rate Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Vendor Rate Project ${unique}`,
      projectType: "Service",
      contractId: `CON-VENDOR-${unique}`,
      wbsId: `WBS-VENDOR-${unique}`,
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-VENDOR-${unique}`,
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set(headers)
    .expect(200);

  const vendorRate = await request(app)
    .post("/api/v1/h2r/vendor-rates")
    .set(headers)
    .send({
      contractorId: `CONT-${unique}`,
      vendorName: `Vendor ${unique}`,
      role: "Senior Engineer",
      hourlyRate: 120,
      effectiveFrom: "2026-01-01",
      currency: "USD",
    })
    .expect(201);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({
      name: `Timesheet Employee ${unique}`,
      email: `timesheet.${unique}@example.com`
    })
    .expect(201);

  const created = await request(app)
    .post("/api/v1/timesheets")
    .set(headers)
    .send({
      organizationId: organization.body.organization_id,
      employeeId: employee.body.employee_id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07"
    })
    .expect(201);

  const line = await request(app)
    .post(`/api/v1/timesheets/${created.body.data.timesheetId}/lines`)
    .set(headers)
    .send({
      projectId: project.body.data.projectId,
      resourceId: vendorRate.body.data.contractorId,
      resourceType: "contractor",
      vendorRateId: vendorRate.body.data.vendorRateId,
      workDate: "2026-01-02",
      hours: 8,
      costElementId: "COST-LABOR-PRIMARY",
      description: "Consulting work",
    })
    .expect(201);

  assert.equal(line.body.success, true);
  assert.equal(line.body.data.resourceType, "contractor");
  assert.equal(line.body.data.hourlyRate, 120);
  assert.equal(line.body.data.lineCost, 960);
  assert.equal(line.body.data.projectId, project.body.data.projectId);
});

test("Timesheet API supports unified labor workflow for employees", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Timesheet Org ${unique}` })
    .expect(201);

  const employee = await request(app)
    .post("/api/v1/h2r/employees")
    .set(headers)
    .send({
      name: `Timesheet Employee ${unique}`,
      email: `timesheet.${unique}@example.com`
    })
    .expect(201);

  const created = await request(app)
    .post("/api/v1/timesheets")
    .set(headers)
    .send({
      organizationId: organization.body.organization_id,
      employeeId: employee.body.employee_id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07"
    })
    .expect(201);

  assert.equal(created.body.success, true);
  assert.equal(created.body.data.employeeId, employee.body.employee_id);
  assert.equal(created.body.data.status, "Draft");

  const submitted = await request(app)
    .post(`/api/v1/timesheets/${created.body.data.timesheetId}/submit`)
    .set(headers)
    .expect(200);

  assert.equal(submitted.body.data.status, "Submitted");

  const approved = await request(app)
    .post(`/api/v1/timesheets/${created.body.data.timesheetId}/approve`)
    .set(headers)
    .expect(200);

  assert.equal(approved.body.data.status, "Approved");
});

test("Inventory service SKUs can be created as non-stock deliverables", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({
      skuCode: `SKU-SVC-${unique}`,
      description: "Service deliverable SKU",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 0,
      skuType: "service",
    })
    .expect(201);

  assert.equal(sku.body.sku_type, "service");
  assert.equal(sku.body.description, "Service deliverable SKU");
});

test("Inventory reservations enforce hard allocation availability and support release", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({
      skuCode: `SKU-RSV-${unique}`,
      description: "Reservation test SKU",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 10
    })
    .expect(201);

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Main WH ${unique}` })
    .expect(201);

  await request(app)
    .post("/api/v1/inv/movements")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      movementType: "receipt",
      quantity: 5,
      unitCost: 10,
      reason: "seed stock"
    })
    .expect(201);

  const hardReservation = await request(app)
    .post("/api/v1/inv/reservations")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      reservationType: "hard",
      quantity: 3,
      reason: "allocate to outbound wave"
    })
    .expect(201);

  assert.equal(hardReservation.body.status, "Active");
  assert.equal(hardReservation.body.reservation_type, "hard");
  assert.equal(hardReservation.body.quantity, 3);

  const overReserve = await request(app)
    .post("/api/v1/inv/reservations")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      reservationType: "hard",
      quantity: 3,
      reason: "should fail"
    })
    .expect(409);

  assert.equal(overReserve.body.title, "insufficient_available_inventory");

  const released = await request(app)
    .post(`/api/v1/inv/reservations/${hardReservation.body.reservation_id}/release`)
    .set(headers)
    .send({ reason: "demand canceled" })
    .expect(200);

  assert.equal(released.body.status, "Released");
  assert.equal(released.body.released_reason, "demand canceled");

  const activeReservations = await request(app)
    .get("/api/v1/inv/reservations")
    .query({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      status: "Active"
    })
    .set(headers)
    .expect(200);

  assert.equal(activeReservations.body.data.length, 0);
});

test("Inventory bin operations support putaway and pick constraints", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({
      skuCode: `SKU-BIN-${unique}`,
      description: "Bin operation test SKU",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 12
    })
    .expect(201);

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Bin WH ${unique}` })
    .expect(201);

  await request(app)
    .post("/api/v1/inv/movements")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      movementType: "receipt",
      quantity: 10,
      unitCost: 12,
      reason: "seed stock for bin test"
    })
    .expect(201);

  const bin = await request(app)
    .post("/api/v1/inv/bins")
    .set(headers)
    .send({
      organizationId: organization.body.organization_id,
      binCode: `A-01-${unique}`,
      zone: "A",
      aisle: "01",
      rack: "R1",
      shelfLevel: "L1"
    })
    .expect(201);

  const putaway = await request(app)
    .post("/api/v1/inv/bins/putaway")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      binId: bin.body.bin_id,
      quantity: 6,
      reason: "putaway to primary bin"
    })
    .expect(201);

  assert.equal(putaway.body.operation, "putaway");
  assert.equal(putaway.body.balanceAfter, 6);

  const overPutaway = await request(app)
    .post("/api/v1/inv/bins/putaway")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      binId: bin.body.bin_id,
      quantity: 5,
      reason: "should exceed unallocated on-hand"
    })
    .expect(409);

  assert.equal(overPutaway.body.title, "insufficient_unallocated_on_hand");

  const balancesAfterPutaway = await request(app)
    .get(`/api/v1/inv/bins/${bin.body.bin_id}/balances`)
    .query({ skuId: sku.body.sku_id })
    .set(headers)
    .expect(200);

  assert.equal(balancesAfterPutaway.body.data.length, 1);
  assert.equal(balancesAfterPutaway.body.data[0].quantity, 6);

  const pick = await request(app)
    .post("/api/v1/inv/bins/pick")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      binId: bin.body.bin_id,
      quantity: 2,
      reason: "pick for shipment"
    })
    .expect(201);

  assert.equal(pick.body.operation, "pick");
  assert.equal(pick.body.balanceAfter, 4);

  const overPick = await request(app)
    .post("/api/v1/inv/bins/pick")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      binId: bin.body.bin_id,
      quantity: 5,
      reason: "should exceed bin quantity"
    })
    .expect(409);

  assert.equal(overPick.body.title, "insufficient_bin_quantity");
});

test("Inventory cycle count posts bin variance to on-hand", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({
      skuCode: `SKU-CC-${unique}`,
      description: "Cycle count test SKU",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 15
    })
    .expect(201);

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Cycle Count WH ${unique}` })
    .expect(201);

  await request(app)
    .post("/api/v1/inv/movements")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      movementType: "receipt",
      quantity: 10,
      unitCost: 15,
      reason: "seed stock for cycle count"
    })
    .expect(201);

  const bin = await request(app)
    .post("/api/v1/inv/bins")
    .set(headers)
    .send({
      organizationId: organization.body.organization_id,
      binCode: `CC-01-${unique}`,
      zone: "CC",
      aisle: "01",
      rack: "R1",
      shelfLevel: "L1"
    })
    .expect(201);

  await request(app)
    .post("/api/v1/inv/bins/putaway")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      binId: bin.body.bin_id,
      quantity: 7,
      reason: "putaway before count"
    })
    .expect(201);

  const cycleCount = await request(app)
    .post("/api/v1/inv/cycle-counts")
    .set(headers)
    .send({
      organizationId: organization.body.organization_id,
      binId: bin.body.bin_id,
      reason: "scheduled weekly count"
    })
    .expect(201);

  assert.equal(cycleCount.body.status, "Open");

  const recordedLine = await request(app)
    .post(`/api/v1/inv/cycle-counts/${cycleCount.body.cycle_count_id}/lines`)
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      countedQuantity: 5,
      reason: "shrinkage observed"
    })
    .expect(201);

  assert.equal(recordedLine.body.expected_quantity, 7);
  assert.equal(recordedLine.body.counted_quantity, 5);
  assert.equal(recordedLine.body.variance_quantity, -2);

  const posted = await request(app)
    .post(`/api/v1/inv/cycle-counts/${cycleCount.body.cycle_count_id}/post`)
    .set(headers)
    .expect(200);

  assert.equal(posted.body.status, "Posted");

  const binBalances = await request(app)
    .get(`/api/v1/inv/bins/${bin.body.bin_id}/balances`)
    .query({ skuId: sku.body.sku_id })
    .set(headers)
    .expect(200);

  assert.equal(binBalances.body.data[0].quantity, 5);

  const onHand = await request(app)
    .get("/api/v1/inv/on-hand")
    .query({ skuId: sku.body.sku_id, organizationId: organization.body.organization_id })
    .set(headers)
    .expect(200);

  assert.equal(onHand.body.data[0].quantity_on_hand, 8);
});

test("Inventory lot and serial tracking enforces traceability constraints", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({
      skuCode: `SKU-LS-${unique}`,
      description: "Lot serial test SKU",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 20
    })
    .expect(201);

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Lot Serial WH ${unique}` })
    .expect(201);

  await request(app)
    .post("/api/v1/inv/movements")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      movementType: "receipt",
      quantity: 4,
      unitCost: 20,
      reason: "seed stock for lot serial"
    })
    .expect(201);

  const lot = await request(app)
    .post("/api/v1/inv/lots")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      lotCode: `LOT-${unique}`,
      quantityOnHand: 3
    })
    .expect(201);

  assert.equal(lot.body.status, "Active");
  assert.equal(lot.body.quantity_on_hand, 3);

  const overLot = await request(app)
    .post("/api/v1/inv/lots")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      lotCode: `LOT-OVER-${unique}`,
      quantityOnHand: 2
    })
    .expect(409);

  assert.equal(overLot.body.title, "insufficient_untracked_on_hand");

  const serial = await request(app)
    .post("/api/v1/inv/serials")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: organization.body.organization_id,
      serialNumber: `SER-${unique}`,
      lotId: lot.body.lot_id
    })
    .expect(201);

  assert.equal(serial.body.status, "Available");

  const consumedSerial = await request(app)
    .post(`/api/v1/inv/serials/${serial.body.serial_id}/consume`)
    .set(headers)
    .send({ reason: "issued to work order" })
    .expect(200);

  assert.equal(consumedSerial.body.status, "Consumed");

  const lotAfterSerial = await request(app)
    .get(`/api/v1/inv/lots/${lot.body.lot_id}`)
    .set(headers)
    .expect(200);

  assert.equal(lotAfterSerial.body.quantity_on_hand, 2);

  const consumedLot = await request(app)
    .post(`/api/v1/inv/lots/${lot.body.lot_id}/consume`)
    .set(headers)
    .send({ quantity: 2, reason: "final lot issue" })
    .expect(200);

  assert.equal(consumedLot.body.quantity_on_hand, 0);
  assert.equal(consumedLot.body.status, "Consumed");
});

test("Service BOM requirements capture role, estimated hours, and required certification for a project phase", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const organization = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Service BOM Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Service BOM Project ${unique}`,
      projectType: "Service",
      contractId: `CON-SVC-BOM-${unique}`,
      wbsId: `WBS-SVC-BOM-${unique}`,
      budgetAmount: 25000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-SVC-BOM-${unique}`,
      organizationId: organization.body.organization_id,
    })
    .expect(201);

  const requirement = await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/service-bom-requirements`)
    .set(headers)
    .send({
      wbsId: `WBS-SVC-BOM-${unique}`,
      role: "Senior Engineer",
      estimatedHours: 80,
      requiredSkill: "Azure",
      requiredCertification: "Azure Solutions Architect",
    })
    .expect(201);

  assert.equal(requirement.body.success, true);
  assert.equal(requirement.body.data.projectId, project.body.data.projectId);
  assert.equal(requirement.body.data.role, "Senior Engineer");
  assert.equal(requirement.body.data.estimatedHours, 80);
  assert.equal(requirement.body.data.requiredSkill, "Azure");
  assert.equal(requirement.body.data.requiredCertification, "Azure Solutions Architect");

  const requirements = await request(app)
    .get(`/api/v1/projects/${project.body.data.projectId}/service-bom-requirements`)
    .set(headers)
    .expect(200);

  assert.equal(requirements.body.success, true);
  assert.equal(requirements.body.count, 1);
  assert.equal(requirements.body.data[0].role, "Senior Engineer");
  assert.equal(requirements.body.data[0].requiredCertification, "Azure Solutions Architect");
});

test("BOM assignment links an Active project to a project-eligible BOM", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  // Create a SKU for the BOM
  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({
      skuCode: `SKU-BOMPROJ-${unique}`,
      description: "BOM project SKU",
      uom: "EA",
      valuationMethod: "standard",
      standardCost: 50,
    })
    .expect(201);

  // Create an organization
  const org = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `BOM Assign WH ${unique}` })
    .expect(201);

  // Create a BOM
  const bom = await request(app)
    .post("/api/v1/bom")
    .set(headers)
    .send({
      skuId: sku.body.sku_id,
      organizationId: org.body.organization_id,
      revision: "A",
      projectEligible: true,
      costingProfile: "Standard",
      effectiveDate: "2026-01-01",
    })
    .expect(201);

  assert.equal(bom.body.success, true);
  const bomId = bom.body.data.bomId;

  // Create and activate a project
  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `BOM Assign Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-BA-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  const projectId = project.body.data.projectId;

  await request(app)
    .post(`/api/v1/projects/${projectId}/activate`)
    .set({ ...headers, "x-actor-type": "user", "x-actor-id": "test-manager", "x-actor-tier": "1" })
    .send({})
    .expect(200);

  // Assigning BOM to a project that hasn't been activated fails — verify Draft fails
  const draftProject = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Draft Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-BA-DRAFT-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${draftProject.body.data.projectId}/bom-assignments`)
    .set(headers)
    .send({ bomId, quantityPlanned: 2 })
    .expect(400);

  // Assign BOM to the Active project
  const assignment = await request(app)
    .post(`/api/v1/projects/${projectId}/bom-assignments`)
    .set(headers)
    .send({ bomId, quantityPlanned: 10, wbsId: `WBS-${unique}` })
    .expect(201);

  assert.equal(assignment.body.success, true);
  assert.equal(assignment.body.data.projectId, projectId);
  assert.equal(assignment.body.data.bomId, bomId);
  assert.equal(assignment.body.data.quantityPlanned, 10);
  assert.equal(assignment.body.data.wbsId, `WBS-${unique}`);
  assert.equal(assignment.body.data.status, "Active");

  // GET list of BOM assignments
  const list = await request(app)
    .get(`/api/v1/projects/${projectId}/bom-assignments`)
    .set(headers)
    .expect(200);

  assert.equal(list.body.success, true);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].assignmentId, assignment.body.data.assignmentId);
});

test("Material consumption to project decrements on-hand and accrues WIP material cost", async () => {
  const headers = authHeaders();
  const authHeaders2 = { ...headers, "x-actor-type": "user", "x-actor-id": "test-manager", "x-actor-tier": "1" };
  const unique = Date.now();

  const sku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({ skuCode: `SKU-MCON-${unique}`, description: "Material consumption test SKU", uom: "EA", valuationMethod: "standard", standardCost: 25 })
    .expect(201);

  const org = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `MCON WH ${unique}` })
    .expect(201);

  // Receive 20 units into stock
  await request(app)
    .post("/api/v1/inv/movements")
    .set(headers)
    .send({ skuId: sku.body.sku_id, organizationId: org.body.organization_id, movementType: "receipt", quantity: 20, unitCost: 25 })
    .expect(201);

  // Create and activate project
  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Material Consumption Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 10000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-MC-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  const projectId = project.body.data.projectId;
  await request(app).post(`/api/v1/projects/${projectId}/activate`).set(authHeaders2).send({}).expect(200);

  // Issue 8 units to the project
  const issue = await request(app)
    .post("/api/v1/inv/issue-to-project")
    .set(headers)
    .send({ skuId: sku.body.sku_id, organizationId: org.body.organization_id, projectId, quantity: 8, reason: "Material consumption for project" })
    .expect(201);

  assert.equal(issue.body.success, true);
  assert.equal(issue.body.data.movement_type, "issue");
  assert.equal(issue.body.data.project_id, projectId);

  // Verify on-hand = 12 (20 - 8)
  const onHand = await request(app)
    .get("/api/v1/inv/on-hand")
    .query({ skuId: sku.body.sku_id, organizationId: org.body.organization_id })
    .set(headers)
    .expect(200);
  assert.equal(onHand.body.data[0].quantity_on_hand, 12);

  // Verify WIP material balance = 200 (8 × 25)
  const wip = await request(app).get(`/api/v1/projects/${projectId}/wip`).set(headers).expect(200);
  assert.equal(wip.body.data.wipMaterialBalance, 200);
  assert.equal(wip.body.data.wipTotalBalance, 200);

  // Shortage: issuing 50 when only 12 on-hand → 409
  await request(app)
    .post("/api/v1/inv/issue-to-project")
    .set(headers)
    .send({ skuId: sku.body.sku_id, organizationId: org.body.organization_id, projectId, quantity: 50 })
    .expect(409);
});

test("Labour costing to project accrues WIP labor balance", async () => {
  const headers = authHeaders();
  const authHeaders2 = { ...headers, "x-actor-type": "user", "x-actor-id": "test-manager", "x-actor-tier": "1" };
  const unique = Date.now();

  const org = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `Labor WH ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Labor Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 20000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-LAB-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  const projectId = project.body.data.projectId;
  await request(app).post(`/api/v1/projects/${projectId}/activate`).set(authHeaders2).send({}).expect(200);

  // Post 8 hours @ $50/hr = $400
  const entry = await request(app)
    .post(`/api/v1/projects/${projectId}/labor-entries`)
    .set(headers)
    .send({ resourceId: `EMP-LAB-${unique}`, hours: 8, rate: 50, wbsId: `WBS-${unique}`, costElementId: "LABOR-STD" })
    .expect(201);

  assert.equal(entry.body.success, true);
  assert.equal(entry.body.data.projectId, projectId);
  assert.equal(entry.body.data.hours, 8);
  assert.equal(entry.body.data.rate, 50);
  assert.equal(entry.body.data.totalCost, 400);

  // Verify WIP labor balance = 400
  const wip = await request(app).get(`/api/v1/projects/${projectId}/wip`).set(headers).expect(200);
  assert.equal(wip.body.data.wipLaborBalance, 400);
  assert.equal(wip.body.data.wipTotalBalance, 400);

  // Post another 4 hours @ $75/hr = $300 (total = $700)
  await request(app)
    .post(`/api/v1/projects/${projectId}/labor-entries`)
    .set(headers)
    .send({ resourceId: `EMP-LAB2-${unique}`, hours: 4, rate: 75 })
    .expect(201);

  const wip2 = await request(app).get(`/api/v1/projects/${projectId}/wip`).set(headers).expect(200);
  assert.equal(wip2.body.data.wipLaborBalance, 700);
  assert.equal(wip2.body.data.wipTotalBalance, 700);

  // List labor entries
  const list = await request(app).get(`/api/v1/projects/${projectId}/labor-entries`).set(headers).expect(200);
  assert.equal(list.body.success, true);
  assert.equal(list.body.data.length, 2);

  // Labor to Draft project fails
  const draftProject = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `Draft Labor Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 1000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-LAB-D-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${draftProject.body.data.projectId}/labor-entries`)
    .set(headers)
    .send({ resourceId: "EMP-DRAFT", hours: 1, rate: 50 })
    .expect(400);
});

test("Project finished-item creation receipts WIP cost into inventory", async () => {
  const headers = authHeaders();
  const authHeaders2 = { ...headers, "x-actor-type": "user", "x-actor-id": "test-manager", "x-actor-tier": "1" };
  const unique = Date.now();

  // SKU for raw material and SKU for finished good
  const rawSku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({ skuCode: `SKU-RAW-${unique}`, description: "Raw material", uom: "EA", valuationMethod: "standard", standardCost: 20 })
    .expect(201);

  const fgSku = await request(app)
    .post("/api/v1/inv/skus")
    .set(headers)
    .send({ skuCode: `SKU-FG-${unique}`, description: "Finished good", uom: "EA", valuationMethod: "standard", standardCost: 0 })
    .expect(201);

  const org = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `FG WH ${unique}` })
    .expect(201);

  // Stock raw material
  await request(app)
    .post("/api/v1/inv/movements")
    .set(headers)
    .send({ skuId: rawSku.body.sku_id, organizationId: org.body.organization_id, movementType: "receipt", quantity: 10, unitCost: 20 })
    .expect(201);

  // Create and activate project
  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `FG Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 5000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-FG-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  const projectId = project.body.data.projectId;
  await request(app).post(`/api/v1/projects/${projectId}/activate`).set(authHeaders2).send({}).expect(200);

  // Issue 5 raw material units → WIP material = 100 (5 × 20)
  await request(app)
    .post("/api/v1/inv/issue-to-project")
    .set(headers)
    .send({ skuId: rawSku.body.sku_id, organizationId: org.body.organization_id, projectId, quantity: 5 })
    .expect(201);

  // Post 4 hours labor @ $50 = $200
  await request(app)
    .post(`/api/v1/projects/${projectId}/labor-entries`)
    .set(headers)
    .send({ resourceId: `EMP-FG-${unique}`, hours: 4, rate: 50 })
    .expect(201);

  // Verify WIP total = 300
  const wipBefore = await request(app).get(`/api/v1/projects/${projectId}/wip`).set(headers).expect(200);
  assert.equal(wipBefore.body.data.wipTotalBalance, 300);

  // Create 1 finished good — unit cost = WIP total / qty = 300
  const fgItem = await request(app)
    .post(`/api/v1/projects/${projectId}/finished-items`)
    .set(headers)
    .send({ skuId: fgSku.body.sku_id, organizationId: org.body.organization_id, quantity: 1 })
    .expect(201);

  assert.equal(fgItem.body.success, true);
  assert.equal(fgItem.body.data.quantity, 1);
  assert.equal(fgItem.body.data.unitCost, 300);
  assert.equal(fgItem.body.data.totalWipCost, 300);

  // Verify FG SKU on-hand = 1
  const fgOnHand = await request(app)
    .get("/api/v1/inv/on-hand")
    .query({ skuId: fgSku.body.sku_id, organizationId: org.body.organization_id })
    .set(headers)
    .expect(200);
  assert.equal(fgOnHand.body.data[0].quantity_on_hand, 1);

  // List finished items
  const items = await request(app).get(`/api/v1/projects/${projectId}/finished-items`).set(headers).expect(200);
  assert.equal(items.body.data.length, 1);
  assert.equal(items.body.data[0].finishedItemId, fgItem.body.data.finishedItemId);
});

test("Internal trade lifecycle: Draft → Released → Approved", async () => {
  const headers = authHeaders();
  const unique = Date.now();

  const org = await request(app)
    .post("/api/v1/inv/organizations")
    .set(headers)
    .send({ name: `ITR Org ${unique}` })
    .expect(201);

  const project = await request(app)
    .post("/api/v1/projects")
    .set(headers)
    .send({
      name: `ITR Project ${unique}`,
      projectType: "Internal",
      budgetAmount: 10000,
      defaultWIPAccountId: "SYS-120-ASSET-INVENTORY",
      defaultCloseAccountId: "SYS-500-EXP-COGS",
      startDate: "2026-01-01",
      projectManagerId: `EMP-ITR-${unique}`,
      organizationId: org.body.organization_id,
    })
    .expect(201);

  await request(app)
    .post(`/api/v1/projects/${project.body.data.projectId}/activate`)
    .set({ ...headers, "x-actor-type": "user", "x-actor-id": "test-manager", "x-actor-tier": "1" })
    .send({})
    .expect(200);

  // Create internal trade
  const trade = await request(app)
    .post("/api/v1/internal-trades")
    .set(headers)
    .send({
      organizationId: org.body.organization_id,
      tradeType: "InternalPO",
      tradeNumber: `ITR-${unique}`,
      tradeDate: "2026-01-15",
      fromDepartment: "Operations",
      toDepartment: "Projects",
      projectId: project.body.data.projectId,
      transferPricingMethod: "StandardCost",
      transferPricingValue: 0,
    })
    .expect(201);

  assert.equal(trade.body.success, true);
  assert.equal(trade.body.data.status, "Draft");
  assert.equal(trade.body.data.tradeType, "InternalPO");
  assert.equal(trade.body.data.projectId, project.body.data.projectId);

  const tradeId = trade.body.data.tradeId;

  // GET by id
  const fetched = await request(app).get(`/api/v1/internal-trades/${tradeId}`).set(headers).expect(200);
  assert.equal(fetched.body.data.tradeId, tradeId);

  // Release
  const released = await request(app).post(`/api/v1/internal-trades/${tradeId}/release`).set(headers).send({}).expect(200);
  assert.equal(released.body.data.status, "Released");

  // Approve
  const approved = await request(app).post(`/api/v1/internal-trades/${tradeId}/approve`).set(headers).send({}).expect(200);
  assert.equal(approved.body.data.approvalStatus, "Approved");

  // List by organizationId
  const list = await request(app)
    .get("/api/v1/internal-trades")
    .query({ organizationId: org.body.organization_id })
    .set(headers)
    .expect(200);
  assert.ok(list.body.data.some((t: { tradeId: string }) => t.tradeId === tradeId));
});
