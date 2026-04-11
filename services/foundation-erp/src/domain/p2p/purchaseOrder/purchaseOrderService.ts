import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureSupplierExists } from "../supplier/supplierService";
import { ensureLegalEntityExists } from "../../r2r/legalEntity/legalEntityService";

type PurchaseOrderState = "Draft" | "Approved" | "Sent" | "PartiallyReceived" | "FullyReceived" | "Closed" | "Cancelled";

const transitions: Record<PurchaseOrderState, PurchaseOrderState[]> = {
  Draft: ["Approved", "Cancelled"],
  Approved: ["Sent", "Cancelled"],
  Sent: ["PartiallyReceived", "FullyReceived", "Cancelled"],
  PartiallyReceived: ["FullyReceived", "Closed"],
  FullyReceived: ["Closed"],
  Closed: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getPurchaseOrderById(poId: string) {
  const row = db.prepare("SELECT * FROM p2p_purchase_order WHERE po_id = ?").get(poId) as
    | {
        po_id: string;
        requisition_id: string | null;
        supplier_id: string;
        state: PurchaseOrderState;
        total_amount: number;
        currency_code: string | null;
        delivery_address: string | null;
        legal_entity_id: string | null;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Purchase order not found");
  }

  return row;
}

export function listPurchaseOrders() {
  return db.prepare("SELECT * FROM p2p_purchase_order ORDER BY created_at DESC LIMIT 100").all();
}

function assertTransition(fromState: PurchaseOrderState, toState: PurchaseOrderState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition purchase order from ${fromState} to ${toState}`);
  }
}

export function createPurchaseOrder(
  input: {
    supplierId: string;
    requisitionId?: string;
    totalAmount?: number;
    currencyCode?: string;
    deliveryAddress?: string;
    legalEntityId?: string;
  },
  actor?: EventActor
) {
  ensureSupplierExists(input.supplierId);
  const effectiveLegalEntityId = input.legalEntityId ?? 'LE-SEED-DEFAULT';
  ensureLegalEntityExists(effectiveLegalEntityId);

  const poId = newId("PO-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_purchase_order(po_id, requisition_id, supplier_id, legal_entity_id, state, total_amount, currency_code, delivery_address, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?, 1, ?, ?)`
    ).run(
      poId,
      input.requisitionId ?? null,
      input.supplierId,
      effectiveLegalEntityId,
      input.totalAmount ?? 0,
      input.currencyCode ?? null,
      input.deliveryAddress ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: poId,
      entityType: "PurchaseOrder",
      eventType: "po.created",
      version: 1,
      payload: {
        requisitionId: input.requisitionId ?? null,
        supplierId: input.supplierId,
        totalAmount: input.totalAmount ?? 0,
        currencyCode: input.currencyCode ?? null,
        legalEntityId: input.legalEntityId ?? null
      },
      actor
    });
  });

  return getPurchaseOrderById(poId);
}

export function createPurchaseOrderFromRequisition(
  input: { requisitionId: string; supplierId: string; legalEntityId?: string },
  actor?: EventActor
) {
  const requisition = db.prepare("SELECT * FROM p2p_requisition WHERE requisition_id = ?").get(input.requisitionId) as
    | { requisition_id: string; state: string; total_amount: number; legal_entity_id: string | null; version: number }
    | undefined;

  if (!requisition) {
    throw new HttpError(404, "not_found", "Requisition not found");
  }

  if (requisition.state !== "Approved") {
    throw new HttpError(409, "invalid_transition", "Requisition must be Approved before conversion");
  }

  ensureSupplierExists(input.supplierId);

  const effectiveLegalEntityId = input.legalEntityId ?? requisition.legal_entity_id ?? null;

  if (effectiveLegalEntityId) {
    ensureLegalEntityExists(effectiveLegalEntityId);
  }

  const requisitionLines = db
    .prepare(
      `SELECT description, quantity, unit_price, line_total, tax_code_id, tax_applicability, tax_rate_percent, tax_amount
       FROM p2p_requisition_line
       WHERE requisition_id = ?
       ORDER BY created_at ASC`
    )
    .all(input.requisitionId) as Array<{
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      tax_code_id: string | null;
      tax_applicability: string | null;
      tax_rate_percent: number | null;
      tax_amount: number;
    }>;

  const poId = newId("PO-");
  const timestamp = now();
  const copiedLineTotal = requisitionLines.reduce((sum, line) => sum + line.line_total, 0);
  const totalAmount = requisitionLines.length > 0 ? copiedLineTotal : requisition.total_amount;

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_purchase_order(po_id, requisition_id, supplier_id, legal_entity_id, state, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Draft', ?, 1, ?, ?)`
    ).run(poId, input.requisitionId, input.supplierId, effectiveLegalEntityId, totalAmount, timestamp, timestamp);

    if (requisitionLines.length > 0) {
      const insertPOLine = db.prepare(
        `INSERT INTO p2p_purchase_order_line(
          po_line_id,
          po_id,
          description,
          quantity,
          unit_price,
          line_total,
          tax_code_id,
          tax_applicability,
          tax_rate_percent,
          tax_amount,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const line of requisitionLines) {
        insertPOLine.run(
          newId("PO-L-"),
          poId,
          line.description,
          line.quantity,
          line.unit_price,
          line.line_total,
          line.tax_code_id,
          line.tax_applicability,
          line.tax_rate_percent,
          line.tax_amount,
          timestamp
        );
      }
    }

    db.prepare("UPDATE p2p_requisition SET state = 'ConvertedToPO', version = version + 1, updated_at = ? WHERE requisition_id = ?")
      .run(timestamp, input.requisitionId);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.converted",
      version: requisition.version + 1,
      payload: { poId, supplierId: input.supplierId },
      actor
    });

    appendEvent({
      entityId: poId,
      entityType: "PurchaseOrder",
      eventType: "po.created",
      version: 1,
      payload: {
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        totalAmount,
        lineCount: requisitionLines.length,
        legalEntityId: effectiveLegalEntityId
      },
      actor
    });
  });

  return getPurchaseOrderById(poId);
}

function updatePOState(poId: string, toState: PurchaseOrderState, eventType: string, actor?: EventActor) {
  const po = getPurchaseOrderById(poId);
  assertTransition(po.state, toState);

  const nextVersion = po.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE p2p_purchase_order SET state = ?, version = ?, updated_at = ? WHERE po_id = ?")
      .run(toState, nextVersion, timestamp, poId);

    appendEvent({
      entityId: poId,
      entityType: "PurchaseOrder",
      eventType,
      version: nextVersion,
      payload: { from: po.state, to: toState },
      actor
    });
  });

  return getPurchaseOrderById(poId);
}

export function approvePurchaseOrder(poId: string, actor?: EventActor) {
  return updatePOState(poId, "Approved", "po.approved", actor);
}

export function sendPurchaseOrder(poId: string, actor?: EventActor) {
  return updatePOState(poId, "Sent", "po.sent", actor);
}

export function receiveGoods(poId: string, isPartial: boolean, actor?: EventActor) {
  const toState: PurchaseOrderState = isPartial ? "PartiallyReceived" : "FullyReceived";
  const eventType = isPartial ? "po.received.partial" : "po.received.full";
  return updatePOState(poId, toState, eventType, actor);
}

export function closePurchaseOrder(poId: string, actor?: EventActor) {
  return updatePOState(poId, "Closed", "po.closed", actor);
}

export function cancelPurchaseOrder(poId: string, actor?: EventActor) {
  return updatePOState(poId, "Cancelled", "po.cancelled", actor);
}

/** @deprecated use approvePurchaseOrder / sendPurchaseOrder */
export function updatePurchaseOrderState(poId: string, toState: PurchaseOrderState, actor?: EventActor) {
  const eventTypeMap: Partial<Record<PurchaseOrderState, string>> = {
    Approved: "po.approved",
    Sent: "po.sent",
    PartiallyReceived: "po.received.partial",
    FullyReceived: "po.received.full",
    Closed: "po.closed",
    Cancelled: "po.cancelled"
  };
  return updatePOState(poId, toState, eventTypeMap[toState] ?? `po.${toState.toLowerCase()}`, actor);
}
