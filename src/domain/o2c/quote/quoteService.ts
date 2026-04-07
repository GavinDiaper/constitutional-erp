import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureCustomerExists } from "../customer/customerService";
import { ensureLegalEntityExists } from "../../r2r/legalEntity/legalEntityService";
import { calculateTax, determineTaxByCode } from "../../tax/taxService";

type QuoteState = "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired" | "ConvertedToOrder";

const transitions: Record<QuoteState, QuoteState[]> = {
  Draft: ["Sent", "Rejected"],
  Sent: ["Accepted", "Rejected", "Expired"],
  Accepted: ["ConvertedToOrder"],
  Rejected: [],
  Expired: [],
  ConvertedToOrder: []
};

interface QuoteInput {
  customerId: string;
  currencyCode: string;
  legalEntityId: string;
}

interface QuoteLineInput {
  quoteId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxTreatment?: string;
  taxCodeId?: string;
  countryCode?: string;
}

function mapTaxTreatmentToCode(taxTreatment?: string): string | undefined {
  if (!taxTreatment) {
    return undefined;
  }

  const normalized = taxTreatment.trim().toLowerCase();
  if (normalized === "standard rate (5%)") {
    return "TCOD-VAT5";
  }
  if (normalized === "zero-rated supplies (0%)") {
    return "TCOD-VAT0";
  }
  if (normalized === "exempt supplies") {
    return "TCOD-EXEMPT";
  }

  return undefined;
}

interface QuoteLineRow {
  quote_line_id: string;
  quote_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_code_id: string | null;
  tax_applicability: string | null;
  tax_rate_percent: number | null;
  tax_amount: number;
  created_at: string;
}

interface QuoteTaxOptionRow {
  tax_code_id: string;
  code: string;
  tax_applicability: string;
  rate_percent: number;
}

function buildTaxOptionLabel(input: { taxApplicability: string; ratePercent: number }): string {
  if (input.taxApplicability === "exempt") {
    return "Exempt Supplies";
  }

  if (input.taxApplicability === "zero-rated" || input.ratePercent === 0) {
    return "Zero-Rated Supplies (0%)";
  }

  return `Standard Rate (${input.ratePercent}%)`;
}

function now(): string {
  return new Date().toISOString();
}

function getQuote(quoteId: string) {
  const row = db.prepare("SELECT * FROM o2c_quote WHERE quote_id = ?").get(quoteId) as
    | {
        quote_id: string;
        customer_id: string;
        state: QuoteState;
        currency_code: string;
        total_amount: number;
        legal_entity_id: string | null;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Quote not found");
  }

  return row;
}

function assertTransition(fromState: QuoteState, toState: QuoteState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition quote from ${fromState} to ${toState}`);
  }
}

export function createQuote(input: QuoteInput) {
  const quoteId = newId("Q-");
  const timestamp = now();

  const effectiveLegalEntityId = input.legalEntityId;
  ensureLegalEntityExists(effectiveLegalEntityId);

  transaction(() => {
    ensureCustomerExists(input.customerId);

    db.prepare(
      `INSERT INTO o2c_quote(quote_id, customer_id, legal_entity_id, state, currency_code, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, 0, 1, ?, ?)`
    ).run(quoteId, input.customerId, effectiveLegalEntityId, input.currencyCode, timestamp, timestamp);

    appendEvent({
      entityId: quoteId,
      entityType: "Quote",
      eventType: "quote.created",
      version: 1,
      payload: {
        customerId: input.customerId,
        currencyCode: input.currencyCode,
        legalEntityId: input.legalEntityId ?? null
      }
    });
  });

  return getQuote(quoteId);
}

export function addQuoteLine(input: QuoteLineInput) {
  const quote = getQuote(input.quoteId);
  if (quote.state !== "Draft" && quote.state !== "Sent") {
    throw new HttpError(409, "invalid_transition", "Lines can only be added while quote is Draft or Sent");
  }

  const quoteLineId = newId("QL-");
  const lineTotal = input.quantity * input.unitPrice;
  const effectiveTaxCodeId = input.taxCodeId ?? mapTaxTreatmentToCode(input.taxTreatment);
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const taxDetermination = effectiveTaxCodeId
    ? determineTaxByCode({
        taxCodeId: effectiveTaxCodeId,
        countryCode: input.countryCode ?? "AE",
        invoiceDate
      })
    : null;
  const taxCalc = taxDetermination
    ? calculateTax(lineTotal, taxDetermination.ratePercent, taxDetermination.inclusiveFlag)
    : null;
  const lineTaxAmount = taxCalc?.taxAmount ?? 0;
  const timestamp = now();
  const nextVersion = quote.version + 1;

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_quote_line(
         quote_line_id,
         quote_id,
         sku,
         quantity,
         unit_price,
         line_total,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      quoteLineId,
      input.quoteId,
      input.sku,
      input.quantity,
      input.unitPrice,
      lineTotal,
      taxDetermination?.taxCodeId ?? null,
      taxDetermination?.taxApplicability ?? null,
      taxDetermination?.ratePercent ?? null,
      lineTaxAmount,
      timestamp
    );

    db.prepare("UPDATE o2c_quote SET total_amount = total_amount + ?, version = ?, updated_at = ? WHERE quote_id = ?")
      .run(lineTotal, nextVersion, timestamp, input.quoteId);

    appendEvent({
      entityId: input.quoteId,
      entityType: "Quote",
      eventType: "quote.line_added",
      version: nextVersion,
      payload: {
        quoteLineId,
        sku: input.sku,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        taxCodeId: taxDetermination?.taxCodeId ?? null,
        taxAmount: lineTaxAmount
      }
    });
  });

  return getQuote(input.quoteId);
}

export function listQuotes() {
  return db.prepare("SELECT * FROM o2c_quote ORDER BY created_at DESC LIMIT 100").all();
}

export function getQuoteById(quoteId: string) {
  return getQuote(quoteId);
}

export function listQuoteLines(quoteId: string): QuoteLineRow[] {
  ensureQuoteExists(quoteId);
  return db
    .prepare(
      "SELECT quote_line_id, quote_id, sku, quantity, unit_price, line_total, tax_code_id, tax_applicability, tax_rate_percent, tax_amount, created_at FROM o2c_quote_line WHERE quote_id = ? ORDER BY created_at ASC"
    )
    .all(quoteId) as QuoteLineRow[];
}

export function listQuoteTaxOptions(quoteId: string) {
  const quote = getQuote(quoteId);
  if (!quote.legal_entity_id) {
    return [];
  }

  const asOfDate = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT
         tc.tax_code_id,
         tc.code,
         tc.tax_applicability,
         COALESCE(MAX(tr.rate_percent), 0) AS rate_percent
       FROM tax_account_mapping tam
       JOIN tax_code tc ON tc.tax_code_id = tam.tax_code_id
       LEFT JOIN tax_rate tr
         ON tr.tax_code_id = tc.tax_code_id
        AND tr.effective_from <= ?
        AND (tr.effective_to IS NULL OR tr.effective_to > ?)
       WHERE tam.legal_entity_id = ?
         AND tam.transaction_type = 'ar-invoice'
         AND tam.is_active = 1
         AND tc.is_active = 1
       GROUP BY tc.tax_code_id, tc.code, tc.tax_applicability
       ORDER BY tc.code ASC`
    )
    .all(asOfDate, asOfDate, quote.legal_entity_id) as QuoteTaxOptionRow[];

  return rows.map((row) => ({
    taxCodeId: row.tax_code_id,
    code: row.code,
    taxApplicability: row.tax_applicability,
    ratePercent: row.rate_percent,
    label: buildTaxOptionLabel({ taxApplicability: row.tax_applicability, ratePercent: row.rate_percent })
  }));
}

function ensureQuoteExists(quoteId: string): void {
  getQuote(quoteId);
}

export function updateQuoteState(quoteId: string, toState: QuoteState, actor?: EventActor) {
  return _doQuoteTransition(quoteId, toState, actor);
}

function _doQuoteTransition(quoteId: string, toState: QuoteState, actor?: EventActor) {
  const quote = getQuote(quoteId);
  assertTransition(quote.state, toState);

  const nextVersion = quote.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_quote SET state = ?, version = ?, updated_at = ? WHERE quote_id = ?")
      .run(toState, nextVersion, timestamp, quoteId);

    appendEvent({
      entityId: quoteId,
      entityType: "Quote",
      eventType: `quote.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: quote.state, to: toState }
    });
  });

  return getQuote(quoteId);
}

export function sendQuote(quoteId: string, actor?: EventActor) {
  return _doQuoteTransition(quoteId, "Sent", actor);
}

export function acceptQuote(quoteId: string, actor?: EventActor) {
  return _doQuoteTransition(quoteId, "Accepted", actor);
}

export function rejectQuote(quoteId: string, actor?: EventActor) {
  return _doQuoteTransition(quoteId, "Rejected", actor);
}

export function expireQuote(quoteId: string, actor?: EventActor) {
  return _doQuoteTransition(quoteId, "Expired", actor);
}

export function convertQuoteToOrder(quoteId: string, actor?: EventActor) {
  // This function is now deprecated - use createOrderFromQuote from salesOrderService instead
  // Kept for backwards compatibility with existing code paths
  return _doQuoteTransition(quoteId, "ConvertedToOrder", actor);
}
