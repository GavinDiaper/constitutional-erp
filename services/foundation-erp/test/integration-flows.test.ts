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
