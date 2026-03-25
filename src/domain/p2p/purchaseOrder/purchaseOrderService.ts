import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureSupplierExists } from "../supplier/supplierService";

type PurchaseOrderState = "Draft" | "Issued" | "Acknowledged" | "Received" | "Invoiced" | "Closed";

const transitions: Record<PurchaseOrderState, PurchaseOrderState[]> = {
  Draft: ["Issued"],
  Issued: ["Acknowledged"],
  Acknowledged: ["Received"],
  Received: ["Invoiced"],
  Invoiced: ["Closed"],
  Closed: []
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

export function createPurchaseOrder(input: { supplierId: string; requisitionId?: string; totalAmount?: number }) {
  ensureSupplierExists(input.supplierId);

  const poId = newId("PO-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_purchase_order(po_id, requisition_id, supplier_id, state, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, 1, ?, ?)`
    ).run(poId, input.requisitionId ?? null, input.supplierId, input.totalAmount ?? 0, timestamp, timestamp);

    appendEvent({
      entityId: poId,
      entityType: "PurchaseOrder",
      eventType: "PurchaseOrderCreated",
      version: 1,
      payload: {
        requisitionId: input.requisitionId ?? null,
        supplierId: input.supplierId,
        totalAmount: input.totalAmount ?? 0
      }
    });
  });

  return getPurchaseOrderById(poId);
}

export function createPurchaseOrderFromRequisition(input: { requisitionId: string; supplierId: string }) {
  const requisition = db.prepare("SELECT * FROM p2p_requisition WHERE requisition_id = ?").get(input.requisitionId) as
    | { requisition_id: string; state: string; total_amount: number; version: number }
    | undefined;

  if (!requisition) {
    throw new HttpError(404, "not_found", "Requisition not found");
  }

  if (requisition.state !== "Approved") {
    throw new HttpError(409, "invalid_transition", "Requisition must be Approved before conversion");
  }

  ensureSupplierExists(input.supplierId);

  const poId = newId("PO-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_purchase_order(po_id, requisition_id, supplier_id, state, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, 1, ?, ?)`
    ).run(poId, input.requisitionId, input.supplierId, requisition.total_amount, timestamp, timestamp);

    db.prepare("UPDATE p2p_requisition SET state = 'ConvertedToPO', version = version + 1, updated_at = ? WHERE requisition_id = ?")
      .run(timestamp, input.requisitionId);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "RequisitionConvertedToPO",
      version: requisition.version + 1,
      payload: { poId, supplierId: input.supplierId }
    });

    appendEvent({
      entityId: poId,
      entityType: "PurchaseOrder",
      eventType: "PurchaseOrderCreated",
      version: 1,
      payload: {
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        totalAmount: requisition.total_amount
      }
    });
  });

  return getPurchaseOrderById(poId);
}

export function updatePurchaseOrderState(poId: string, toState: PurchaseOrderState) {
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
      eventType: `PurchaseOrder${toState}`,
      version: nextVersion,
      payload: { from: po.state, to: toState }
    });
  });

  return getPurchaseOrderById(poId);
}
