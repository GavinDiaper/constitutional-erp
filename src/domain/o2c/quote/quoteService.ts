import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureCustomerExists } from "../customer/customerService";
import { ensureLegalEntityExists } from "../../r2r/legalEntity/legalEntityService";

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
  legalEntityId?: string;
}

interface QuoteLineInput {
  quoteId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
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

  const effectiveLegalEntityId = input.legalEntityId ?? 'LE-SEED-DEFAULT';
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
  const timestamp = now();
  const nextVersion = quote.version + 1;

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_quote_line(quote_line_id, quote_id, sku, quantity, unit_price, line_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(quoteLineId, input.quoteId, input.sku, input.quantity, input.unitPrice, lineTotal, timestamp);

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
        lineTotal
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
