import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type SalesOrderState = "Draft" | "Confirmed" | "Allocated" | "Shipped" | "Invoiced" | "Paid" | "Closed";

const transitions: Record<SalesOrderState, SalesOrderState[]> = {
  Draft: ["Confirmed"],
  Confirmed: ["Allocated"],
  Allocated: ["Shipped"],
  Shipped: ["Invoiced"],
  Invoiced: ["Paid"],
  Paid: ["Closed"],
  Closed: []
};

function now(): string {
  return new Date().toISOString();
}

export function getOrderById(orderId: string) {
  const row = db.prepare("SELECT * FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | {
        order_id: string;
        state: SalesOrderState;
        customer_id: string;
        quote_id: string | null;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Sales order not found");
  }

  return row;
}

export function listOrders() {
  return db.prepare("SELECT * FROM o2c_sales_order ORDER BY created_at DESC LIMIT 100").all();
}

function assertTransition(fromState: SalesOrderState, toState: SalesOrderState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition order from ${fromState} to ${toState}`);
  }
}

export function createOrderFromQuote(quoteId: string) {
  const quote = db.prepare("SELECT * FROM o2c_quote WHERE quote_id = ?").get(quoteId) as
    | {
        quote_id: string;
        customer_id: string;
        state: string;
        currency_code: string;
        total_amount: number;
        version: number;
      }
    | undefined;

  if (!quote) {
    throw new HttpError(404, "not_found", "Quote not found");
  }

  if (quote.state !== "Accepted") {
    throw new HttpError(409, "invalid_transition", "Quote must be Accepted before conversion");
  }

  const quoteLines = db.prepare("SELECT * FROM o2c_quote_line WHERE quote_id = ?").all(quoteId) as Array<{
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;

  const orderId = newId("SO-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_sales_order(order_id, quote_id, customer_id, state, currency_code, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, 1, ?, ?)`
    ).run(orderId, quoteId, quote.customer_id, quote.currency_code, quote.total_amount, timestamp, timestamp);

    const insertLine = db.prepare(
      `INSERT INTO o2c_sales_order_line(order_line_id, order_id, sku, quantity, unit_price, line_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const line of quoteLines) {
      insertLine.run(newId("SOL-"), orderId, line.sku, line.quantity, line.unit_price, line.line_total, timestamp);
    }

    db.prepare("UPDATE o2c_quote SET state = 'ConvertedToOrder', version = version + 1, updated_at = ? WHERE quote_id = ?")
      .run(timestamp, quoteId);

    appendEvent({
      entityId: quoteId,
      entityType: "Quote",
      eventType: "QuoteConvertedToOrder",
      version: quote.version + 1,
      payload: { orderId }
    });

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: "SalesOrderCreated",
      version: 1,
      payload: { quoteId, customerId: quote.customer_id }
    });
  });

  return getOrderById(orderId);
}

export function updateOrderState(orderId: string, toState: SalesOrderState) {
  const order = getOrderById(orderId);
  assertTransition(order.state, toState);

  const nextVersion = order.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_sales_order SET state = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run(toState, nextVersion, timestamp, orderId);

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: `Order${toState}`,
      version: nextVersion,
      payload: { from: order.state, to: toState }
    });
  });

  return getOrderById(orderId);
}
