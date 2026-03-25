import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type GoodsReceiptState = "Draft" | "Received" | "Accepted";

const transitions: Record<GoodsReceiptState, GoodsReceiptState[]> = {
  Draft: ["Received"],
  Received: ["Accepted"],
  Accepted: []
};

function now(): string {
  return new Date().toISOString();
}

export function getGoodsReceiptById(receiptId: string) {
  const row = db.prepare("SELECT * FROM p2p_goods_receipt WHERE receipt_id = ?").get(receiptId) as
    | { receipt_id: string; po_id: string; state: GoodsReceiptState; version: number }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Goods receipt not found");
  }

  return row;
}

export function listGoodsReceipts() {
  return db.prepare("SELECT * FROM p2p_goods_receipt ORDER BY created_at DESC LIMIT 100").all();
}

function assertTransition(fromState: GoodsReceiptState, toState: GoodsReceiptState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition goods receipt from ${fromState} to ${toState}`);
  }
}

export function createGoodsReceipt(poId: string) {
  const po = db.prepare("SELECT * FROM p2p_purchase_order WHERE po_id = ?").get(poId) as
    | { po_id: string; state: string; version: number }
    | undefined;

  if (!po) {
    throw new HttpError(404, "not_found", "Purchase order not found");
  }

  if (po.state !== "Acknowledged") {
    throw new HttpError(409, "invalid_transition", "Purchase order must be Acknowledged before receiving goods");
  }

  const receiptId = newId("GR-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_goods_receipt(receipt_id, po_id, state, received_at, version, created_at, updated_at)
       VALUES (?, ?, 'Draft', NULL, 1, ?, ?)`
    ).run(receiptId, poId, timestamp, timestamp);

    appendEvent({
      entityId: receiptId,
      entityType: "GoodsReceipt",
      eventType: "GoodsReceiptCreated",
      version: 1,
      payload: { poId }
    });
  });

  return getGoodsReceiptById(receiptId);
}

export function updateGoodsReceiptState(receiptId: string, toState: GoodsReceiptState) {
  const receipt = getGoodsReceiptById(receiptId);
  assertTransition(receipt.state, toState);

  const nextVersion = receipt.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE p2p_goods_receipt SET state = ?, version = ?, received_at = ?, updated_at = ? WHERE receipt_id = ?")
      .run(toState, nextVersion, toState === "Received" ? timestamp : null, timestamp, receiptId);

    if (toState === "Accepted") {
      const po = db.prepare("SELECT version FROM p2p_purchase_order WHERE po_id = ?").get(receipt.po_id) as
        | { version: number }
        | undefined;

      if (!po) {
        throw new HttpError(404, "not_found", "Purchase order not found");
      }

      db.prepare("UPDATE p2p_purchase_order SET state = 'Received', version = version + 1, updated_at = ? WHERE po_id = ?")
        .run(timestamp, receipt.po_id);

      appendEvent({
        entityId: receipt.po_id,
        entityType: "PurchaseOrder",
        eventType: "PurchaseOrderReceived",
        version: po.version + 1,
        payload: { receiptId }
      });
    }

    appendEvent({
      entityId: receiptId,
      entityType: "GoodsReceipt",
      eventType: `GoodsReceipt${toState}`,
      version: nextVersion,
      payload: { from: receipt.state, to: toState }
    });
  });

  return getGoodsReceiptById(receiptId);
}
