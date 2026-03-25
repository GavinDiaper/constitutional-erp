import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type RequisitionState = "Draft" | "Submitted" | "Approved" | "ConvertedToPO" | "Rejected";

const transitions: Record<RequisitionState, RequisitionState[]> = {
  Draft: ["Submitted", "Rejected"],
  Submitted: ["Approved", "Rejected"],
  Approved: ["ConvertedToPO"],
  ConvertedToPO: [],
  Rejected: []
};

function now(): string {
  return new Date().toISOString();
}

function getRequisition(requisitionId: string) {
  const row = db.prepare("SELECT * FROM p2p_requisition WHERE requisition_id = ?").get(requisitionId) as
    | {
        requisition_id: string;
        requester: string;
        state: RequisitionState;
        total_amount: number;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Requisition not found");
  }

  return row;
}

function assertTransition(fromState: RequisitionState, toState: RequisitionState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(
      409,
      "invalid_transition",
      `Cannot transition requisition from ${fromState} to ${toState}`
    );
  }
}

export function createRequisition(requester: string) {
  const requisitionId = newId("REQ-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_requisition(requisition_id, requester, state, total_amount, version, created_at, updated_at)
       VALUES (?, ?, 'Draft', 0, 1, ?, ?)`
    ).run(requisitionId, requester, timestamp, timestamp);

    appendEvent({
      entityId: requisitionId,
      entityType: "Requisition",
      eventType: "RequisitionCreated",
      version: 1,
      payload: { requester }
    });
  });

  return getRequisition(requisitionId);
}

export function listRequisitions() {
  return db.prepare("SELECT * FROM p2p_requisition ORDER BY created_at DESC LIMIT 100").all();
}

export function getRequisitionById(requisitionId: string) {
  return getRequisition(requisitionId);
}

export function updateRequisitionState(requisitionId: string, toState: RequisitionState) {
  const requisition = getRequisition(requisitionId);
  assertTransition(requisition.state, toState);

  const nextVersion = requisition.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE p2p_requisition SET state = ?, version = ?, updated_at = ? WHERE requisition_id = ?")
      .run(toState, nextVersion, timestamp, requisitionId);

    appendEvent({
      entityId: requisitionId,
      entityType: "Requisition",
      eventType: `Requisition${toState}`,
      version: nextVersion,
      payload: { from: requisition.state, to: toState }
    });
  });

  return getRequisition(requisitionId);
}
