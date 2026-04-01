import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type RequisitionState = "Draft" | "Submitted" | "Approved" | "ConvertedToPO" | "Rejected" | "Cancelled";

interface RequisitionRow {
  requisition_id: string;
  state: RequisitionState;
  total_amount: number;
  version: number;
}

interface RequisitionLineRow {
  requisition_line_id: string;
  requisition_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

function now(): string {
  return new Date().toISOString();
}

function getRequisitionForLines(requisitionId: string): RequisitionRow {
  const row = db.prepare("SELECT requisition_id, state, total_amount, version FROM p2p_requisition WHERE requisition_id = ?").get(requisitionId) as
    | RequisitionRow
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Requisition not found");
  }

  return row;
}

function assertDraftState(state: RequisitionState) {
  if (state !== "Draft") {
    throw new HttpError(409, "invalid_transition", "Requisition lines can only be changed in Draft state");
  }
}

function getLineOrThrow(requisitionId: string, requisitionLineId: string): RequisitionLineRow {
  const row = db.prepare("SELECT * FROM p2p_requisition_line WHERE requisition_line_id = ? AND requisition_id = ?").get(requisitionLineId, requisitionId) as
    | RequisitionLineRow
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Requisition line not found");
  }

  return row;
}

function sumRequisitionLineTotals(requisitionId: string): number {
  const row = db.prepare("SELECT COALESCE(SUM(line_total), 0) AS total FROM p2p_requisition_line WHERE requisition_id = ?").get(requisitionId) as
    | { total: number }
    | undefined;

  return row?.total ?? 0;
}

function updateRequisitionTotals(requisitionId: string, nextVersion: number, timestamp: string) {
  const totalAmount = sumRequisitionLineTotals(requisitionId);
  db.prepare("UPDATE p2p_requisition SET total_amount = ?, version = ?, updated_at = ? WHERE requisition_id = ?")
    .run(totalAmount, nextVersion, timestamp, requisitionId);
  return totalAmount;
}

export function listRequisitionLines(requisitionId: string): RequisitionLineRow[] {
  getRequisitionForLines(requisitionId);
  return db
    .prepare("SELECT * FROM p2p_requisition_line WHERE requisition_id = ? ORDER BY created_at ASC")
    .all(requisitionId) as RequisitionLineRow[];
}

export function addRequisitionLine(
  input: { requisitionId: string; description: string; quantity: number; unitPrice: number },
  actor?: EventActor
): { line: RequisitionLineRow; requisition: RequisitionRow } {
  const requisition = getRequisitionForLines(input.requisitionId);
  assertDraftState(requisition.state);

  const requisitionLineId = newId("REQ-L-");
  const timestamp = now();
  const lineTotal = input.quantity * input.unitPrice;
  const nextVersion = requisition.version + 1;

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_requisition_line(requisition_line_id, requisition_id, description, quantity, unit_price, line_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(requisitionLineId, input.requisitionId, input.description, input.quantity, input.unitPrice, lineTotal, timestamp);

    const totalAmount = updateRequisitionTotals(input.requisitionId, nextVersion, timestamp);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.line_added",
      version: nextVersion,
      payload: {
        requisitionLineId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        totalAmount
      },
      actor
    });
  });

  const line = getLineOrThrow(input.requisitionId, requisitionLineId);
  const updatedRequisition = getRequisitionForLines(input.requisitionId);
  return { line, requisition: updatedRequisition };
}

export function updateRequisitionLine(
  input: { requisitionId: string; requisitionLineId: string; description: string; quantity: number; unitPrice: number },
  actor?: EventActor
): { line: RequisitionLineRow; requisition: RequisitionRow } {
  const requisition = getRequisitionForLines(input.requisitionId);
  assertDraftState(requisition.state);
  getLineOrThrow(input.requisitionId, input.requisitionLineId);

  const timestamp = now();
  const lineTotal = input.quantity * input.unitPrice;
  const nextVersion = requisition.version + 1;

  transaction(() => {
    db.prepare(
      `UPDATE p2p_requisition_line
       SET description = ?, quantity = ?, unit_price = ?, line_total = ?
       WHERE requisition_line_id = ? AND requisition_id = ?`
    ).run(
      input.description,
      input.quantity,
      input.unitPrice,
      lineTotal,
      input.requisitionLineId,
      input.requisitionId
    );

    const totalAmount = updateRequisitionTotals(input.requisitionId, nextVersion, timestamp);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.line_updated",
      version: nextVersion,
      payload: {
        requisitionLineId: input.requisitionLineId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        totalAmount
      },
      actor
    });
  });

  const line = getLineOrThrow(input.requisitionId, input.requisitionLineId);
  const updatedRequisition = getRequisitionForLines(input.requisitionId);
  return { line, requisition: updatedRequisition };
}

export function removeRequisitionLine(
  input: { requisitionId: string; requisitionLineId: string },
  actor?: EventActor
): RequisitionRow {
  const requisition = getRequisitionForLines(input.requisitionId);
  assertDraftState(requisition.state);
  const existingLine = getLineOrThrow(input.requisitionId, input.requisitionLineId);

  const timestamp = now();
  const nextVersion = requisition.version + 1;

  transaction(() => {
    db.prepare("DELETE FROM p2p_requisition_line WHERE requisition_line_id = ? AND requisition_id = ?")
      .run(input.requisitionLineId, input.requisitionId);

    const totalAmount = updateRequisitionTotals(input.requisitionId, nextVersion, timestamp);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.line_removed",
      version: nextVersion,
      payload: {
        requisitionLineId: existingLine.requisition_line_id,
        removedLineTotal: existingLine.line_total,
        totalAmount
      },
      actor
    });
  });

  return getRequisitionForLines(input.requisitionId);
}
