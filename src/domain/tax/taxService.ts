import { db } from "../../db/connection";
import { appendEvent } from "../../events/eventStore";
import { newId } from "../../utils/id";
import type {
  TaxApplicability,
  TaxCalculation,
  TaxDetermination,
  TaxTransactionLineInput,
  TaxTransactionLineRow,
  TaxTransactionType
} from "./taxTypes";

function now(): string {
  return new Date().toISOString();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Calculation ───────────────────────────────────────────────────────────────

export function calculateTax(
  amount: number,
  ratePercent: number,
  inclusive: boolean
): TaxCalculation {
  if (ratePercent === 0) {
    const base = round2(amount);
    return { taxableAmount: base, taxAmount: 0, grossAmount: base, ratePercent, inclusiveFlag: inclusive };
  }

  const rate = ratePercent / 100;

  if (inclusive) {
    const taxableAmount = round2(amount / (1 + rate));
    const taxAmount = round2(amount - taxableAmount);
    return {
      taxableAmount,
      taxAmount,
      grossAmount: round2(amount),
      ratePercent,
      inclusiveFlag: true
    };
  }

  const taxableAmount = round2(amount);
  const taxAmount = round2(amount * rate);
  return {
    taxableAmount,
    taxAmount,
    grossAmount: round2(taxableAmount + taxAmount),
    ratePercent,
    inclusiveFlag: false
  };
}

// ── Condition evaluation for tax rules ───────────────────────────────────────

interface TaxConditionSet {
  conditions: Array<{ field: string; op: string; value: string }>;
  match?: 'all' | 'any';
}

function evaluateConditions(
  conditionSet: TaxConditionSet,
  ctx: Record<string, string | undefined>
): boolean {
  const { conditions, match = 'all' } = conditionSet;
  if (!conditions || conditions.length === 0) return true;

  const results = conditions.map(({ field, op, value }) => {
    const ctxVal = (ctx[field] ?? '').toLowerCase();
    const ruleVal = (value ?? '').toLowerCase();
    switch (op) {
      case 'eq':  return ctxVal === ruleVal;
      case 'neq': return ctxVal !== ruleVal;
      case 'in':  return ruleVal.split(',').map(v => v.trim()).includes(ctxVal);
      case 'nin': return !ruleVal.split(',').map(v => v.trim()).includes(ctxVal);
      case 'starts_with': return ctxVal.startsWith(ruleVal);
      default:    return false;
    }
  });

  return match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

// ── Rule evaluation ───────────────────────────────────────────────────────────

type RuleRow = {
  tax_rule_id: string;
  tax_code_id: string;
  tax_code_str: string;
  tax_applicability: TaxApplicability;
  regime_id: string;
  conditions_json: string;
  priority: number;
};

type RateRow = {
  tax_rate_id: string;
  rate_percent: number;
  inclusive_flag: number;
  tax_jurisdiction_id: string;
};

export function evaluateTax(input: {
  regimeId: string;
  countryCode: string;
  transactionType: TaxTransactionType;
  invoiceDate: string;
  legalEntityId?: string;
  customerCountry?: string;
  supplierCountry?: string;
  itemCategory?: string;
}): TaxDetermination | null {
  const rules = db.prepare(
    `SELECT tr.tax_rule_id, tr.tax_code_id, tc.code AS tax_code_str, tc.tax_applicability,
            tr.tax_regime_id AS regime_id, tr.conditions_json, tr.priority
     FROM tax_rule tr
     JOIN tax_code tc ON tc.tax_code_id = tr.tax_code_id
     WHERE tr.tax_regime_id = ?
       AND tr.is_active = 1
       AND tr.effective_from <= ?
       AND (tr.effective_to IS NULL OR tr.effective_to > ?)
     ORDER BY tr.priority ASC`
  ).all(input.regimeId, input.invoiceDate, input.invoiceDate) as RuleRow[];

  const ctx: Record<string, string> = {
    transaction_type:  input.transactionType,
    country_code:      input.countryCode,
    customer_country:  input.customerCountry ?? input.countryCode,
    supplier_country:  input.supplierCountry ?? input.countryCode,
    item_category:     input.itemCategory ?? ''
  };

  for (const rule of rules) {
    let conditionSet: TaxConditionSet;
    try {
      conditionSet = JSON.parse(rule.conditions_json) as TaxConditionSet;
    } catch {
      continue;
    }

    if (!evaluateConditions(conditionSet, ctx)) continue;

    const rate = db.prepare(
      `SELECT tr.tax_rate_id, tr.rate_percent, tr.inclusive_flag, tr.tax_jurisdiction_id
       FROM tax_rate tr
       JOIN tax_jurisdiction tj ON tj.tax_jurisdiction_id = tr.tax_jurisdiction_id
       WHERE tr.tax_code_id = ?
         AND tj.country_code = ?
         AND tr.effective_from <= ?
         AND (tr.effective_to IS NULL OR tr.effective_to > ?)
       ORDER BY tr.effective_from DESC
       LIMIT 1`
    ).get(rule.tax_code_id, input.countryCode, input.invoiceDate, input.invoiceDate) as RateRow | undefined;

    return {
      taxRegimeId:     input.regimeId,
      taxCodeId:       rule.tax_code_id,
      taxCode:         rule.tax_code_str,
      taxApplicability: rule.tax_applicability,
      taxRateId:       rate?.tax_rate_id ?? null,
      taxRuleId:       rule.tax_rule_id,
      jurisdictionId:  rate?.tax_jurisdiction_id ?? null,
      ratePercent:     rate?.rate_percent ?? 0,
      inclusiveFlag:   (rate?.inclusive_flag ?? 0) === 1
    };
  }

  return null;
}

// ── Tax code direct lookup (skip rules) ──────────────────────────────────────

export function determineTaxByCode(input: {
  taxCodeId: string;
  countryCode: string;
  invoiceDate: string;
}): TaxDetermination | null {
  const codeRow = db.prepare(
    "SELECT tc.*, tr.tax_regime_id FROM tax_code tc JOIN tax_regime tr ON tr.tax_regime_id = tc.tax_regime_id WHERE tc.tax_code_id = ? AND tc.is_active = 1"
  ).get(input.taxCodeId) as { tax_code_id: string; code: string; tax_applicability: TaxApplicability; tax_regime_id: string } | undefined;

  if (!codeRow) return null;

  const rate = db.prepare(
    `SELECT tr.tax_rate_id, tr.rate_percent, tr.inclusive_flag, tr.tax_jurisdiction_id
     FROM tax_rate tr
     JOIN tax_jurisdiction tj ON tj.tax_jurisdiction_id = tr.tax_jurisdiction_id
     WHERE tr.tax_code_id = ?
       AND tj.country_code = ?
       AND tr.effective_from <= ?
       AND (tr.effective_to IS NULL OR tr.effective_to > ?)
     ORDER BY tr.effective_from DESC
     LIMIT 1`
  ).get(input.taxCodeId, input.countryCode, input.invoiceDate, input.invoiceDate) as RateRow | undefined;

  return {
    taxRegimeId:      codeRow.tax_regime_id,
    taxCodeId:        codeRow.tax_code_id,
    taxCode:          codeRow.code,
    taxApplicability: codeRow.tax_applicability,
    taxRateId:        rate?.tax_rate_id ?? null,
    taxRuleId:        null,
    jurisdictionId:   rate?.tax_jurisdiction_id ?? null,
    ratePercent:      rate?.rate_percent ?? 0,
    inclusiveFlag:    (rate?.inclusive_flag ?? 0) === 1
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function persistTaxLine(input: TaxTransactionLineInput): string {
  const taxTransactionLineId = newId("TTXL-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO tax_transaction_line(
       tax_transaction_line_id, source_domain, source_entity_type, source_entity_id,
       source_event_id, legal_entity_id, tax_regime_id, tax_jurisdiction_id, tax_code_id,
       tax_rate_id, tax_rule_id, transaction_type, tax_applicability, taxable_amount,
       tax_amount, currency_code, accounting_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    taxTransactionLineId,
    input.sourceDomain,
    input.sourceEntityType,
    input.sourceEntityId,
    input.sourceEventId ?? null,
    input.legalEntityId ?? null,
    input.taxRegimeId,
    input.taxJurisdictionId ?? null,
    input.taxCodeId,
    input.taxRateId ?? null,
    input.taxRuleId ?? null,
    input.transactionType,
    input.taxApplicability,
    input.taxableAmount,
    input.taxAmount,
    input.currencyCode,
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taxTransactionLineId,
    entityType: "TaxTransactionLine",
    eventType: "tax-line.created",
    version: 1,
    payload: {
      sourceEntityId: input.sourceEntityId,
      transactionType: input.transactionType,
      taxApplicability: input.taxApplicability,
      taxableAmount: input.taxableAmount,
      taxAmount: input.taxAmount,
      currencyCode: input.currencyCode
    }
  });

  return taxTransactionLineId;
}

export function getTaxLinesForEntity(sourceEntityId: string): TaxTransactionLineRow[] {
  return db.prepare(
    "SELECT * FROM tax_transaction_line WHERE source_entity_id = ? ORDER BY created_at ASC"
  ).all(sourceEntityId) as TaxTransactionLineRow[];
}

export function markTaxLinesPosted(sourceEntityId: string, journalId: string): void {
  db.prepare(
    `UPDATE tax_transaction_line
     SET accounting_status = 'posted', accounting_journal_id = ?, updated_at = ?
     WHERE source_entity_id = ? AND accounting_status = 'pending'`
  ).run(journalId, now(), sourceEntityId);
}
