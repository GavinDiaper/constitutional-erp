import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type ShipmentState = "Planned" | "Shipped" | "Delivered" | "Cancelled";

const transitions: Record<ShipmentState, ShipmentState[]> = {
  Planned: ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

function getShipment(shipmentId: string) {
  const row = db.prepare("SELECT * FROM o2c_shipment WHERE shipment_id = ?").get(shipmentId) as
    | { shipment_id: string; order_id: string; state: ShipmentState; version: number }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Shipment not found");
  }

  return row;
}

function assertTransition(from: ShipmentState, to: ShipmentState) {
  if (!transitions[from].includes(to)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition shipment from ${from} to ${to}`);
  }
}

export function createShipment(orderId: string, actor?: EventActor) {
  const order = db.prepare("SELECT order_id, state FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | { order_id: string; state: string }
    | undefined;

  if (!order) {
    throw new HttpError(404, "not_found", "Sales order not found");
  }

  if (!["Confirmed", "Allocated"].includes(order.state)) {
    throw new HttpError(409, "invalid_transition", `Order must be Confirmed or Allocated to create a shipment (current: ${order.state})`);
  }

  const shipmentId = newId("SHIP-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_shipment(shipment_id, order_id, state, version, created_at, updated_at)
       VALUES (?, ?, 'Planned', 1, ?, ?)`
    ).run(shipmentId, orderId, timestamp, timestamp);

    appendEvent({
      entityId: shipmentId,
      entityType: "Shipment",
      eventType: "shipment.created",
      version: 1,
      actor,
      payload: { orderId }
    });
  });

  return getShipmentById(shipmentId);
}

function _doShipmentTransition(shipmentId: string, toState: ShipmentState, extra: Record<string, unknown> = {}, actor?: EventActor) {
  const shipment = getShipment(shipmentId);
  assertTransition(shipment.state, toState);

  const nextVersion = shipment.version + 1;
  const timestamp = now();

  const setClauses = Object.keys(extra).map(k => `${k} = ?`).join(", ");
  const setValues = Object.values(extra);

  transaction(() => {
    if (setClauses) {
      db.prepare(`UPDATE o2c_shipment SET state = ?, version = ?, updated_at = ?, ${setClauses} WHERE shipment_id = ?`)
        .run(toState, nextVersion, timestamp, ...setValues, shipmentId);
    } else {
      db.prepare("UPDATE o2c_shipment SET state = ?, version = ?, updated_at = ? WHERE shipment_id = ?")
        .run(toState, nextVersion, timestamp, shipmentId);
    }

    appendEvent({
      entityId: shipmentId,
      entityType: "Shipment",
      eventType: `shipment.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: shipment.state, to: toState, ...extra }
    });
  });

  return getShipmentById(shipmentId);
}

export function shipOrder(shipmentId: string, options: { carrier?: string; trackingNumber?: string } = {}, actor?: EventActor) {
  const extra: Record<string, unknown> = { ship_date: new Date().toISOString() };
  if (options.carrier) extra["carrier"] = options.carrier;
  if (options.trackingNumber) extra["tracking_number"] = options.trackingNumber;
  return _doShipmentTransition(shipmentId, "Shipped", extra, actor);
}

export function deliverShipment(shipmentId: string, actor?: EventActor) {
  return _doShipmentTransition(shipmentId, "Delivered", {}, actor);
}

export function cancelShipment(shipmentId: string, actor?: EventActor) {
  return _doShipmentTransition(shipmentId, "Cancelled", {}, actor);
}

export function getShipmentById(shipmentId: string) {
  return getShipment(shipmentId);
}

export function listShipments() {
  return db.prepare("SELECT * FROM o2c_shipment ORDER BY created_at DESC LIMIT 100").all();
}

export function getShipmentsByOrderId(orderId: string) {
  return db.prepare("SELECT * FROM o2c_shipment WHERE order_id = ? ORDER BY created_at DESC").all(orderId);
}
