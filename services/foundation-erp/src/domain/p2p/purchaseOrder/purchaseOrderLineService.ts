import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type PurchaseOrderState = "Draft" | "Approved" | "Sent" | "PartiallyReceived" | "FullyReceived" | "Closed" | "Cancelled";

interface PurchaseOrderRow {
  po_id: string;
  state: PurchaseOrderState;
  total_amount: number;
  version: number;
}

interface PurchaseOrderLineRow {
  po_line_id: string;
  po_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

function now(): string {
  return new Date().toISOString();
}

function getPurchaseOrderForLines(poId: string): PurchaseOrderRow {
  const row = db.prepare("SELECT po_id, state, total_amount, version FROM p2p_purchase_order WHERE po_id = ?").get(poId) as
    | PurchaseOrderRow
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Purchase order not found");
  }

  return row;
}

function assertDraftState(state: PurchaseOrderState) {
  if (state !== "Draft") {
    throw new HttpError(409, "invalid_transition", "Purchase order lines can only be changed in Draft state");
  }
}

function getLineOrThrow(poId: string, poLineId: string): PurchaseOrderLineRow {
  const row = db.prepare("SELECT * FROM p2p_purchase_order_line WHERE po_line_id = ? AND po_id = ?").get(poLineId, poId) as
    | PurchaseOrderLineRow
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Purchase order line not found");
  }

  return row;
}

function sumPOLineTotals(poId: string): number {
  const row = db.prepare("SELECT COALESCE(SUM(line_total), 0) AS total FROM p2p_purchase_order_line WHERE po_id = ?").get(poId) as
    | { total: number }
    | undefined;

  return row?.total ?? 0;
}

function updatePOTotal(poId: string, nextVersion: number, timestamp: string) {
  const totalAmount = sumPOLineTotals(poId);
  db.prepare("UPDATE p2p_purchase_order SET total_amount = ?, version = ?, updated_at = ? WHERE po_id = ?")
    .run(totalAmount, nextVersion, timestamp, poId);
  return totalAmount;
}

export function listPurchaseOrderLines(poId: string): PurchaseOrderLineRow[] {
  getPurchaseOrderForLines(poId);
  return db
    .prepare("SELECT * FROM p2p_purchase_order_line WHERE po_id = ? ORDER BY created_at ASC")
    .all(poId) as PurchaseOrderLineRow[];
}

export function addPurchaseOrderLine(
  input: { poId: string; description: string; quantity: number; unitPrice: number },
  actor?: EventActor
): { line: PurchaseOrderLineRow; purchaseOrder: PurchaseOrderRow } {
  const po = getPurchaseOrderForLines(input.poId);
  assertDraftState(po.state);

  const poLineId = newId("PO-L-");
  const timestamp = now();
  const lineTotal = input.quantity * input.unitPrice;
  const nextVersion = po.version + 1;

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_purchase_order_line(po_line_id, po_id, description, quantity, unit_price, line_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(poLineId, input.poId, input.description, input.quantity, input.unitPrice, lineTotal, timestamp);

    const totalAmount = updatePOTotal(input.poId, nextVersion, timestamp);

    appendEvent({
      entityId: input.poId,
      entityType: "PurchaseOrder",
      eventType: "po.line_added",
      version: nextVersion,
      payload: {
        poLineId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        totalAmount
      },
      actor
    });
  });

  const line = getLineOrThrow(input.poId, poLineId);
  const updatedPO = getPurchaseOrderForLines(input.poId);
  return { line, purchaseOrder: updatedPO };
}

export function updatePurchaseOrderLine(
  input: { poId: string; poLineId: string; description: string; quantity: number; unitPrice: number },
  actor?: EventActor
): { line: PurchaseOrderLineRow; purchaseOrder: PurchaseOrderRow } {
  const po = getPurchaseOrderForLines(input.poId);
  assertDraftState(po.state);
  getLineOrThrow(input.poId, input.poLineId);

  const timestamp = now();
  const lineTotal = input.quantity * input.unitPrice;
  const nextVersion = po.version + 1;

  transaction(() => {
    db.prepare(
      `UPDATE p2p_purchase_order_line
       SET description = ?, quantity = ?, unit_price = ?, line_total = ?
       WHERE po_line_id = ? AND po_id = ?`
    ).run(
      input.description,
      input.quantity,
      input.unitPrice,
      lineTotal,
      input.poLineId,
      input.poId
    );

    const totalAmount = updatePOTotal(input.poId, nextVersion, timestamp);

    appendEvent({
      entityId: input.poId,
      entityType: "PurchaseOrder",
      eventType: "po.line_updated",
      version: nextVersion,
      payload: {
        poLineId: input.poLineId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        totalAmount
      },
      actor
    });
  });

  const line = getLineOrThrow(input.poId, input.poLineId);
  const updatedPO = getPurchaseOrderForLines(input.poId);
  return { line, purchaseOrder: updatedPO };
}

export function removePurchaseOrderLine(
  input: { poId: string; poLineId: string },
  actor?: EventActor
): PurchaseOrderRow {
  const po = getPurchaseOrderForLines(input.poId);
  assertDraftState(po.state);
  const existingLine = getLineOrThrow(input.poId, input.poLineId);

  const timestamp = now();
  const nextVersion = po.version + 1;

  transaction(() => {
    db.prepare("DELETE FROM p2p_purchase_order_line WHERE po_line_id = ? AND po_id = ?")
      .run(input.poLineId, input.poId);

    const totalAmount = updatePOTotal(input.poId, nextVersion, timestamp);

    appendEvent({
      entityId: input.poId,
      entityType: "PurchaseOrder",
      eventType: "po.line_removed",
      version: nextVersion,
      payload: {
        poLineId: existingLine.po_line_id,
        removedLineTotal: existingLine.line_total,
        totalAmount
      },
      actor
    });
  });

  return getPurchaseOrderForLines(input.poId);
}
