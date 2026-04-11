import { db, transaction } from "../../db/connection";

const DEFAULT_SEEDED_LEDGER_ID = "LGR-SEED-US";
const EFFECTIVE_FROM = "2018-01-01T00:00:00.000Z";

function now(): string {
  return new Date().toISOString();
}

const TAX_ACCOUNTS = [
  { accountCode: "SYS-130-ASSET-VAT-IN",  accountName: "VAT Input Tax Recoverable", accountType: "Asset" },
  { accountCode: "SYS-210-LIAB-VAT-OUT",  accountName: "VAT Output Tax Liability",  accountType: "Liability" },
  { accountCode: "SYS-215-LIAB-WHT",      accountName: "Withholding Tax Payable",   accountType: "Liability" }
] as const;

function seedTaxAccounts(timestamp: string): void {
  const seededLedger = db
    .prepare("SELECT ledger_id FROM r2r_ledger WHERE ledger_id = ?")
    .get(DEFAULT_SEEDED_LEDGER_ID) as { ledger_id: string } | undefined;
  const ledgerId = seededLedger?.ledger_id ?? null;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO r2r_account(account_id, account_code, account_name, account_type, ledger_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const acc of TAX_ACCOUNTS) {
    // Use a deterministic ID based on account_code so re-seeding is predictable.
    // INSERT OR IGNORE skips if account_code (UNIQUE) already exists.
    const accountId = `ACC-TAX-${acc.accountCode}`;
    insert.run(accountId, acc.accountCode, acc.accountName, acc.accountType, ledgerId, timestamp, timestamp);
  }
}

function getAccountIdByCode(code: string): string | null {
  const row = db
    .prepare("SELECT account_id FROM r2r_account WHERE account_code = ?")
    .get(code) as { account_id: string } | undefined;
  return row?.account_id ?? null;
}

function seedRegimeAndJurisdiction(timestamp: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO tax_regime(tax_regime_id, code, name, description, is_active, created_at, updated_at)
     VALUES ('TREG-UAE-VAT', 'UAE-VAT', 'UAE Value Added Tax', 'UAE VAT per Federal Tax Authority', 1, ?, ?)`
  ).run(timestamp, timestamp);

  db.prepare(
    `INSERT OR IGNORE INTO tax_jurisdiction(tax_jurisdiction_id, tax_regime_id, country_code, name, is_active, created_at, updated_at)
     VALUES ('TJUR-UAE', 'TREG-UAE-VAT', 'AE', 'United Arab Emirates', 1, ?, ?)`
  ).run(timestamp, timestamp);
}

function seedTaxCodes(timestamp: string): void {
  const codes: Array<{ id: string; code: string; description: string; applicability: string }> = [
    { id: "TCOD-VAT5",    code: "VAT5",   description: "Standard Rate VAT 5%",      applicability: "taxable" },
    { id: "TCOD-VAT0",    code: "VAT0",   description: "Zero-Rated VAT 0%",          applicability: "zero-rated" },
    { id: "TCOD-EXEMPT",  code: "EXEMPT", description: "VAT Exempt Supply",          applicability: "exempt" },
    { id: "TCOD-RC5",     code: "RC5",    description: "Reverse Charge VAT 5%",      applicability: "reverse-charge" },
    { id: "TCOD-WHT10",   code: "WHT10",  description: "Withholding Tax 10%",        applicability: "withholding" }
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO tax_code(tax_code_id, tax_regime_id, code, description, tax_applicability, is_active, created_at, updated_at)
     VALUES (?, 'TREG-UAE-VAT', ?, ?, ?, 1, ?, ?)`
  );

  for (const c of codes) {
    insert.run(c.id, c.code, c.description, c.applicability, timestamp, timestamp);
  }
}

function seedTaxRates(timestamp: string): void {
  const rates: Array<{ id: string; codeId: string; ratePercent: number }> = [
    { id: "TRAT-VAT5-AE",   codeId: "TCOD-VAT5",   ratePercent: 5 },
    { id: "TRAT-VAT0-AE",   codeId: "TCOD-VAT0",   ratePercent: 0 },
    { id: "TRAT-EXEMPT-AE", codeId: "TCOD-EXEMPT",  ratePercent: 0 },
    { id: "TRAT-RC5-AE",    codeId: "TCOD-RC5",    ratePercent: 5 },
    { id: "TRAT-WHT10-AE",  codeId: "TCOD-WHT10",  ratePercent: 10 }
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO tax_rate(tax_rate_id, tax_code_id, tax_jurisdiction_id, rate_percent, inclusive_flag, effective_from, created_at, updated_at)
     VALUES (?, ?, 'TJUR-UAE', ?, 0, ?, ?, ?)`
  );

  for (const r of rates) {
    insert.run(r.id, r.codeId, r.ratePercent, EFFECTIVE_FROM, timestamp, timestamp);
  }
}

function seedTaxRules(timestamp: string): void {
  // Default UAE rules: standard VAT5 on domestic transactions.
  // ar-invoice + AE country → VAT5
  // ap-invoice + AE country → VAT5
  // Rules can be overridden by passing taxCodeId explicitly on invoice creation.
  const rules: Array<{ id: string; code: string; name: string; priority: number; codeId: string; conditions: string }> = [
    {
      id: "TRUL-UAE-AR-STD",
      code: "UAE-AR-STD",
      name: "UAE Standard VAT on AR Invoice",
      priority: 10,
      codeId: "TCOD-VAT5",
      conditions: JSON.stringify({
        conditions: [
          { field: "transaction_type", op: "eq",  value: "ar-invoice" },
          { field: "country_code",     op: "eq",  value: "AE" }
        ],
        match: "all"
      })
    },
    {
      id: "TRUL-UAE-AP-STD",
      code: "UAE-AP-STD",
      name: "UAE Standard VAT on AP Invoice",
      priority: 10,
      codeId: "TCOD-VAT5",
      conditions: JSON.stringify({
        conditions: [
          { field: "transaction_type", op: "eq", value: "ap-invoice" },
          { field: "country_code",     op: "eq", value: "AE" }
        ],
        match: "all"
      })
    }
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO tax_rule(tax_rule_id, tax_regime_id, code, name, priority, tax_code_id, conditions_json, effective_from, is_active, created_at, updated_at)
     VALUES (?, 'TREG-UAE-VAT', ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  for (const r of rules) {
    insert.run(r.id, r.code, r.name, r.priority, r.codeId, r.conditions, EFFECTIVE_FROM, timestamp, timestamp);
  }
}

function seedAccountMappings(timestamp: string): void {
  // Mappings: global (no legal_entity_id) for each code × transaction_type × account_role.
  const vatInputId  = getAccountIdByCode("SYS-130-ASSET-VAT-IN");
  const vatOutputId = getAccountIdByCode("SYS-210-LIAB-VAT-OUT");
  const whtId       = getAccountIdByCode("SYS-215-LIAB-WHT");

  if (!vatInputId || !vatOutputId || !whtId) {
    // Tax accounts not yet seeded — skip mappings (will be created on next call)
    return;
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO tax_account_mapping(tax_account_mapping_id, tax_regime_id, legal_entity_id, tax_code_id, transaction_type, account_role, account_id, effective_from, is_active, created_at, updated_at)
     VALUES (?, 'TREG-UAE-VAT', NULL, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  const mappings: Array<{ id: string; codeId: string; txType: string; role: string; accountId: string }> = [
    // VAT5 AR
    { id: "TAMP-VAT5-AR-LIAB",  codeId: "TCOD-VAT5",   txType: "ar-invoice", role: "tax_liability",      accountId: vatOutputId },
    // VAT5 AP
    { id: "TAMP-VAT5-AP-REC",   codeId: "TCOD-VAT5",   txType: "ap-invoice", role: "tax_recoverable",    accountId: vatInputId },
    // VAT0 AR
    { id: "TAMP-VAT0-AR-LIAB",  codeId: "TCOD-VAT0",   txType: "ar-invoice", role: "tax_liability",      accountId: vatOutputId },
    // VAT0 AP
    { id: "TAMP-VAT0-AP-REC",   codeId: "TCOD-VAT0",   txType: "ap-invoice", role: "tax_recoverable",    accountId: vatInputId },
    // EXEMPT AR
    { id: "TAMP-EXEM-AR-LIAB",  codeId: "TCOD-EXEMPT", txType: "ar-invoice", role: "tax_liability",      accountId: vatOutputId },
    // RC5 AP (reverse charge — both sides)
    { id: "TAMP-RC5-AP-REC",    codeId: "TCOD-RC5",    txType: "ap-invoice", role: "tax_recoverable",    accountId: vatInputId },
    { id: "TAMP-RC5-AP-LIAB",   codeId: "TCOD-RC5",    txType: "ap-invoice", role: "tax_liability",      accountId: vatOutputId },
    // WHT10 AP
    { id: "TAMP-WHT10-AP-WHT",  codeId: "TCOD-WHT10",  txType: "ap-invoice", role: "withholding_payable", accountId: whtId }
  ];

  for (const m of mappings) {
    insert.run(m.id, m.codeId, m.txType, m.role, m.accountId, EFFECTIVE_FROM, timestamp, timestamp);
  }
}

export function seedTaxConfiguration(): void {
  const timestamp = now();

  transaction(() => {
    seedTaxAccounts(timestamp);
    seedRegimeAndJurisdiction(timestamp);
    seedTaxCodes(timestamp);
    seedTaxRates(timestamp);
    seedTaxRules(timestamp);
    seedAccountMappings(timestamp);
  });
}
