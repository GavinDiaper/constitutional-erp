import { db } from "../../db/connection";
import { appendEvent } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
import type { TaxAccountRole, TaxApplicability } from "./taxTypes";

function now(): string {
  return new Date().toISOString();
}

// ── Tax Regime ────────────────────────────────────────────────────────────────

export function createTaxRegime(input: { code: string; name: string; description?: string }) {
  const existing = db.prepare("SELECT tax_regime_id FROM tax_regime WHERE code = ?").get(input.code);
  if (existing) {
    throw new HttpError(409, "duplicate", `Tax regime with code '${input.code}' already exists`);
  }

  const taxRegimeId = newId("TREG-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_regime(tax_regime_id, code, name, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run(taxRegimeId, input.code, input.name, input.description ?? null, timestamp, timestamp);

  appendEvent({
    entityId: taxRegimeId,
    entityType: "TaxRegime",
    eventType: "tax-regime.created",
    version: 1,
    payload: { code: input.code, name: input.name }
  });

  return getTaxRegimeById(taxRegimeId);
}

export function getTaxRegimeById(taxRegimeId: string) {
  const row = db.prepare("SELECT * FROM tax_regime WHERE tax_regime_id = ?").get(taxRegimeId);
  if (!row) throw new HttpError(404, "not_found", "Tax regime not found");
  return row as Record<string, unknown>;
}

export function getTaxRegimeByCode(code: string) {
  return db.prepare("SELECT * FROM tax_regime WHERE code = ?").get(code) as Record<string, unknown> | undefined;
}

export function listTaxRegimes() {
  return db.prepare("SELECT * FROM tax_regime ORDER BY created_at ASC").all();
}

// ── Tax Jurisdiction ──────────────────────────────────────────────────────────

export function createTaxJurisdiction(input: {
  taxRegimeId: string;
  countryCode: string;
  regionCode?: string;
  cityCode?: string;
  name: string;
}) {
  getTaxRegimeById(input.taxRegimeId);

  const taxJurisdictionId = newId("TJUR-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_jurisdiction(tax_jurisdiction_id, tax_regime_id, country_code, region_code, city_code, name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    taxJurisdictionId,
    input.taxRegimeId,
    input.countryCode,
    input.regionCode ?? null,
    input.cityCode ?? null,
    input.name,
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taxJurisdictionId,
    entityType: "TaxJurisdiction",
    eventType: "tax-jurisdiction.created",
    version: 1,
    payload: { taxRegimeId: input.taxRegimeId, countryCode: input.countryCode, name: input.name }
  });

  return getTaxJurisdictionById(taxJurisdictionId);
}

export function getTaxJurisdictionById(taxJurisdictionId: string) {
  const row = db.prepare("SELECT * FROM tax_jurisdiction WHERE tax_jurisdiction_id = ?").get(taxJurisdictionId);
  if (!row) throw new HttpError(404, "not_found", "Tax jurisdiction not found");
  return row as Record<string, unknown>;
}

export function listTaxJurisdictions(taxRegimeId?: string) {
  if (taxRegimeId) {
    return db.prepare("SELECT * FROM tax_jurisdiction WHERE tax_regime_id = ? ORDER BY created_at ASC").all(taxRegimeId);
  }
  return db.prepare("SELECT * FROM tax_jurisdiction ORDER BY created_at ASC").all();
}

// ── Tax Code ──────────────────────────────────────────────────────────────────

export function createTaxCode(input: {
  taxRegimeId: string;
  code: string;
  description?: string;
  taxApplicability: TaxApplicability;
}) {
  getTaxRegimeById(input.taxRegimeId);
  const existing = db
    .prepare("SELECT tax_code_id FROM tax_code WHERE tax_regime_id = ? AND code = ?")
    .get(input.taxRegimeId, input.code);
  if (existing) {
    throw new HttpError(409, "duplicate", `Tax code '${input.code}' already exists in this regime`);
  }

  const taxCodeId = newId("TCOD-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_code(tax_code_id, tax_regime_id, code, description, tax_applicability, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(taxCodeId, input.taxRegimeId, input.code, input.description ?? null, input.taxApplicability, timestamp, timestamp);

  appendEvent({
    entityId: taxCodeId,
    entityType: "TaxCode",
    eventType: "tax-code.created",
    version: 1,
    payload: { taxRegimeId: input.taxRegimeId, code: input.code, taxApplicability: input.taxApplicability }
  });

  return getTaxCodeById(taxCodeId);
}

export function getTaxCodeById(taxCodeId: string) {
  const row = db.prepare("SELECT * FROM tax_code WHERE tax_code_id = ?").get(taxCodeId);
  if (!row) throw new HttpError(404, "not_found", "Tax code not found");
  return row as Record<string, unknown>;
}

export function getTaxCodeByCode(regimeId: string, code: string) {
  return db
    .prepare("SELECT * FROM tax_code WHERE tax_regime_id = ? AND code = ? AND is_active = 1")
    .get(regimeId, code) as Record<string, unknown> | undefined;
}

export function listTaxCodes(taxRegimeId?: string) {
  if (taxRegimeId) {
    return db.prepare("SELECT * FROM tax_code WHERE tax_regime_id = ? ORDER BY created_at ASC").all(taxRegimeId);
  }
  return db.prepare("SELECT * FROM tax_code ORDER BY created_at ASC").all();
}

// ── Tax Rate ──────────────────────────────────────────────────────────────────

export function createTaxRate(input: {
  taxCodeId: string;
  taxJurisdictionId: string;
  ratePercent: number;
  inclusiveFlag?: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}) {
  getTaxCodeById(input.taxCodeId);
  getTaxJurisdictionById(input.taxJurisdictionId);

  const taxRateId = newId("TRAT-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_rate(tax_rate_id, tax_code_id, tax_jurisdiction_id, rate_percent, inclusive_flag, effective_from, effective_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taxRateId,
    input.taxCodeId,
    input.taxJurisdictionId,
    input.ratePercent,
    input.inclusiveFlag ? 1 : 0,
    input.effectiveFrom,
    input.effectiveTo ?? null,
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taxRateId,
    entityType: "TaxRate",
    eventType: "tax-rate.created",
    version: 1,
    payload: { taxCodeId: input.taxCodeId, ratePercent: input.ratePercent, effectiveFrom: input.effectiveFrom }
  });

  return getTaxRateById(taxRateId);
}

export function getTaxRateById(taxRateId: string) {
  const row = db.prepare("SELECT * FROM tax_rate WHERE tax_rate_id = ?").get(taxRateId);
  if (!row) throw new HttpError(404, "not_found", "Tax rate not found");
  return row as Record<string, unknown>;
}

export function listTaxRates(taxCodeId?: string) {
  if (taxCodeId) {
    return db.prepare("SELECT * FROM tax_rate WHERE tax_code_id = ? ORDER BY effective_from DESC").all(taxCodeId);
  }
  return db.prepare("SELECT * FROM tax_rate ORDER BY effective_from DESC").all();
}

// ── Tax Rule ──────────────────────────────────────────────────────────────────

export function createTaxRule(input: {
  taxRegimeId: string;
  code: string;
  name: string;
  description?: string;
  priority: number;
  taxCodeId: string;
  conditionsJson: object;
  effectiveFrom: string;
  effectiveTo?: string;
}) {
  getTaxRegimeById(input.taxRegimeId);
  getTaxCodeById(input.taxCodeId);
  const existing = db
    .prepare("SELECT tax_rule_id FROM tax_rule WHERE tax_regime_id = ? AND code = ?")
    .get(input.taxRegimeId, input.code);
  if (existing) {
    throw new HttpError(409, "duplicate", `Tax rule '${input.code}' already exists in this regime`);
  }

  const taxRuleId = newId("TRUL-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_rule(tax_rule_id, tax_regime_id, code, name, description, priority, tax_code_id, conditions_json, effective_from, effective_to, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    taxRuleId,
    input.taxRegimeId,
    input.code,
    input.name,
    input.description ?? null,
    input.priority,
    input.taxCodeId,
    JSON.stringify(input.conditionsJson),
    input.effectiveFrom,
    input.effectiveTo ?? null,
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taxRuleId,
    entityType: "TaxRule",
    eventType: "tax-rule.created",
    version: 1,
    payload: { taxRegimeId: input.taxRegimeId, code: input.code, priority: input.priority }
  });

  return getTaxRuleById(taxRuleId);
}

export function getTaxRuleById(taxRuleId: string) {
  const row = db.prepare("SELECT * FROM tax_rule WHERE tax_rule_id = ?").get(taxRuleId);
  if (!row) throw new HttpError(404, "not_found", "Tax rule not found");
  return row as Record<string, unknown>;
}

export function listTaxRules(taxRegimeId?: string) {
  if (taxRegimeId) {
    return db
      .prepare("SELECT * FROM tax_rule WHERE tax_regime_id = ? ORDER BY priority ASC, created_at ASC")
      .all(taxRegimeId);
  }
  return db.prepare("SELECT * FROM tax_rule ORDER BY priority ASC, created_at ASC").all();
}

export function deactivateTaxRule(taxRuleId: string) {
  getTaxRuleById(taxRuleId);
  db.prepare("UPDATE tax_rule SET is_active = 0, updated_at = ? WHERE tax_rule_id = ?").run(now(), taxRuleId);
  return getTaxRuleById(taxRuleId);
}

// ── Tax Account Mapping ───────────────────────────────────────────────────────

export function createTaxAccountMapping(input: {
  taxRegimeId: string;
  taxCodeId: string;
  transactionType: string;
  accountRole: TaxAccountRole;
  accountId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legalEntityId?: string;
}) {
  getTaxRegimeById(input.taxRegimeId);
  getTaxCodeById(input.taxCodeId);

  const taxAccountMappingId = newId("TAMP-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_account_mapping(tax_account_mapping_id, tax_regime_id, legal_entity_id, tax_code_id, transaction_type, account_role, account_id, effective_from, effective_to, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    taxAccountMappingId,
    input.taxRegimeId,
    input.legalEntityId ?? null,
    input.taxCodeId,
    input.transactionType,
    input.accountRole,
    input.accountId,
    input.effectiveFrom,
    input.effectiveTo ?? null,
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taxAccountMappingId,
    entityType: "TaxAccountMapping",
    eventType: "tax-account-mapping.created",
    version: 1,
    payload: {
      taxRegimeId: input.taxRegimeId,
      taxCodeId: input.taxCodeId,
      transactionType: input.transactionType,
      accountRole: input.accountRole,
      accountId: input.accountId
    }
  });

  return getTaxAccountMappingById(taxAccountMappingId);
}

export function getTaxAccountMappingById(taxAccountMappingId: string) {
  const row = db
    .prepare("SELECT * FROM tax_account_mapping WHERE tax_account_mapping_id = ?")
    .get(taxAccountMappingId);
  if (!row) throw new HttpError(404, "not_found", "Tax account mapping not found");
  return row as Record<string, unknown>;
}

export function listTaxAccountMappings(taxRegimeId?: string) {
  if (taxRegimeId) {
    return db
      .prepare("SELECT * FROM tax_account_mapping WHERE tax_regime_id = ? ORDER BY created_at ASC")
      .all(taxRegimeId);
  }
  return db.prepare("SELECT * FROM tax_account_mapping ORDER BY created_at ASC").all();
}

export function resolveTaxAccount(input: {
  taxCodeId: string;
  transactionType: string;
  accountRole: TaxAccountRole;
  asOfDate: string;
  legalEntityId?: string;
}): string | null {
  const row = db
    .prepare(
      `SELECT account_id
       FROM tax_account_mapping
       WHERE tax_code_id = ?
         AND transaction_type = ?
         AND account_role = ?
         AND is_active = 1
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to > ?)
         AND (legal_entity_id = ? OR legal_entity_id IS NULL)
       ORDER BY CASE WHEN legal_entity_id IS NOT NULL THEN 0 ELSE 1 END, effective_from DESC
       LIMIT 1`
    )
    .get(
      input.taxCodeId,
      input.transactionType,
      input.accountRole,
      input.asOfDate,
      input.asOfDate,
      input.legalEntityId ?? null
    ) as { account_id: string } | undefined;

  return row?.account_id ?? null;
}
