import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureLegalEntityExists } from "../../r2r/legalEntity/legalEntityService";

type SalesOrderState = "Draft" | "Confirmed" | "Allocated" | "Shipped" | "Invoiced" | "Paid" | "Closed" | "Cancelled";

const transitions: Record<SalesOrderState, SalesOrderState[]> = {
  Draft: ["Confirmed", "Cancelled"],
  Confirmed: ["Allocated", "Cancelled"],
  Allocated: ["Shipped", "Cancelled"],
  Shipped: ["Invoiced", "Cancelled"],
  Invoiced: ["Paid"],
  Paid: ["Closed"],
  Closed: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

function ensureProjectExists(projectId: string): void {
  const row = db.prepare("SELECT project_id FROM proj_project WHERE project_id = ?").get(projectId) as
    | { project_id: string }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Project not found");
  }
}

export function getOrderById(orderId: string) {
  const row = db.prepare("SELECT * FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | {
        order_id: string;
        state: SalesOrderState;
        customer_id: string;
        quote_id: string | null;
        project_id: string | null;
        wbs_id: string | null;
        legal_entity_id: string | null;
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

export function listOrderLines(orderId: string) {
  getOrderById(orderId);
  return db
    .prepare(
      `SELECT
         order_line_id,
         order_id,
         sku,
         quantity,
         unit_price,
         line_total,
         project_id,
         wbs_id,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         created_at
       FROM o2c_sales_order_line
       WHERE order_id = ?
       ORDER BY created_at ASC`
    )
    .all(orderId);
}

function assertTransition(fromState: SalesOrderState, toState: SalesOrderState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition order from ${fromState} to ${toState}`);
  }
}

export function createOrderFromQuote(quoteId: string, legalEntityId?: string, projectId?: string, wbsId?: string) {
  const quote = db.prepare("SELECT * FROM o2c_quote WHERE quote_id = ?").get(quoteId) as
    | {
        quote_id: string;
        customer_id: string;
        state: string;
        currency_code: string;
        total_amount: number;
        project_id: string | null;
        legal_entity_id: string | null;
        version: number;
      }
    | undefined;

  if (!quote) {
    throw new HttpError(404, "not_found", "Quote not found");
  }

  if (quote.state !== "Accepted") {
    throw new HttpError(409, "invalid_transition", "Quote must be Accepted before conversion");
  }

  const effectiveLegalEntityId = legalEntityId ?? quote.legal_entity_id ?? null;

  if (effectiveLegalEntityId) {
    ensureLegalEntityExists(effectiveLegalEntityId);
  }

  const effectiveProjectId = projectId ?? quote.project_id ?? null;

  if (effectiveProjectId) {
    ensureProjectExists(effectiveProjectId);
  }

  const quoteLines = db.prepare("SELECT * FROM o2c_quote_line WHERE quote_id = ?").all(quoteId) as Array<{
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    tax_code_id: string | null;
    tax_applicability: string | null;
    tax_rate_percent: number | null;
    tax_amount: number;
  }>;

  const orderId = newId("SO-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_sales_order(order_id, quote_id, customer_id, project_id, wbs_id, legal_entity_id, state, currency_code, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?, 1, ?, ?)`
    ).run(
      orderId,
      quoteId,
      quote.customer_id,
      effectiveProjectId,
      wbsId ?? null,
      effectiveLegalEntityId,
      quote.currency_code,
      quote.total_amount,
      timestamp,
      timestamp
    );

    const insertLine = db.prepare(
      `INSERT INTO o2c_sales_order_line(
         order_line_id,
         order_id,
         sku,
         quantity,
         unit_price,
         line_total,
         project_id,
         wbs_id,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const line of quoteLines) {
      insertLine.run(
        newId("SOL-"),
        orderId,
        line.sku,
        line.quantity,
        line.unit_price,
        line.line_total,
        effectiveProjectId,
        wbsId ?? null,
        line.tax_code_id,
        line.tax_applicability,
        line.tax_rate_percent,
        line.tax_amount ?? 0,
        timestamp
      );
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
      eventType: "order.created",
      version: 1,
      payload: {
        quoteId,
        customerId: quote.customer_id,
        projectId: effectiveProjectId,
        wbsId: wbsId ?? null,
        legalEntityId: effectiveLegalEntityId
      }
    });
  });

  return getOrderById(orderId);
}

export function assignOrderProject(orderId: string, projectId: string, wbsId?: string | null, actor?: EventActor) {
  const order = getOrderById(orderId);

  if (["Invoiced", "Paid", "Closed", "Cancelled"].includes(order.state)) {
    throw new HttpError(409, "invalid_transition", `Cannot change project for order in ${order.state} state`);
  }

  ensureProjectExists(projectId);

  const nextVersion = order.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_sales_order SET project_id = ?, wbs_id = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run(projectId, wbsId ?? null, nextVersion, timestamp, orderId);

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: "order.project_assigned",
      version: nextVersion,
      actor,
      payload: {
        fromProjectId: order.project_id ?? null,
        fromWbsId: order.wbs_id ?? null,
        toProjectId: projectId,
        toWbsId: wbsId ?? null
      }
    });
  });

  return getOrderById(orderId);
}

export function updateOrderState(orderId: string, toState: SalesOrderState, actor?: EventActor) {
  return _doOrderTransition(orderId, toState, actor);
}

function _doOrderTransition(orderId: string, toState: SalesOrderState, actor?: EventActor) {
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
      eventType: `order.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: order.state, to: toState }
    });
  });

  return getOrderById(orderId);
}

export function confirmOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Confirmed", actor);
}

export function allocateOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Allocated", actor);
}

export function shipOrder(orderId: string, actor?: EventActor) {
  const order = getOrderById(orderId);
  assertTransition(order.state, "Shipped");

  const nextVersion = order.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_sales_order SET state = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run("Shipped", nextVersion, timestamp, orderId);

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: "order.shipped",
      version: nextVersion,
      actor,
      payload: { from: order.state, to: "Shipped" }
    });

    const shipmentId = newId("SHIP-");
    db.prepare(
      `INSERT INTO o2c_shipment(shipment_id, order_id, state, ship_date, version, created_at, updated_at)
       VALUES (?, ?, 'Shipped', ?, 2, ?, ?)`
    ).run(shipmentId, orderId, timestamp, timestamp, timestamp);

    appendEvent({
      entityId: shipmentId,
      entityType: "Shipment",
      eventType: "shipment.created",
      version: 1,
      actor,
      payload: { orderId }
    });

    appendEvent({
      entityId: shipmentId,
      entityType: "Shipment",
      eventType: "shipment.shipped",
      version: 2,
      actor,
      payload: { from: "Planned", to: "Shipped" }
    });
  });

  return getOrderById(orderId);
}

export function closeOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Closed", actor);
}

export function cancelOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Cancelled", actor);
}
