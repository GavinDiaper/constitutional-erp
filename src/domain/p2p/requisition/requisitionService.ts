import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureLegalEntityExists } from "../../r2r/legalEntity/legalEntityService";

type RequisitionState = "Draft" | "Submitted" | "Approved" | "ConvertedToPO" | "Rejected" | "Cancelled";

const transitions: Record<RequisitionState, RequisitionState[]> = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Approved", "Rejected", "Cancelled"],
  Approved: ["ConvertedToPO", "Cancelled"],
  ConvertedToPO: [],
  Rejected: [],
  Cancelled: []
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
        legal_entity_id: string | null;
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

export function createRequisition(
  input: { requester: string; department?: string; currencyCode?: string; neededByDate?: string; legalEntityId?: string },
  actor?: EventActor
) {
  const requisitionId = newId("REQ-");
  const timestamp = now();

  if (input.legalEntityId) {
    ensureLegalEntityExists(input.legalEntityId);
  }

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_requisition(requisition_id, requester, legal_entity_id, state, total_amount, department, currency_code, needed_by_date, version, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', 0, ?, ?, ?, 1, ?, ?)`
    ).run(
      requisitionId,
      input.requester,
      input.legalEntityId ?? null,
      input.department ?? null,
      input.currencyCode ?? null,
      input.neededByDate ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: requisitionId,
      entityType: "Requisition",
      eventType: "requisition.created",
      version: 1,
      payload: {
        requester: input.requester,
        department: input.department ?? null,
        currencyCode: input.currencyCode ?? null,
        neededByDate: input.neededByDate ?? null,
        legalEntityId: input.legalEntityId ?? null
      },
      actor
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

const eventTypeMap: Record<RequisitionState, string> = {
  Draft: "requisition.created",
  Submitted: "requisition.submitted",
  Approved: "requisition.approved",
  Rejected: "requisition.rejected",
  Cancelled: "requisition.cancelled",
  ConvertedToPO: "requisition.converted"
};

export function updateRequisitionState(requisitionId: string, toState: RequisitionState, actor?: EventActor) {
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
      eventType: eventTypeMap[toState],
      version: nextVersion,
      payload: { from: requisition.state, to: toState },
      actor
    });
  });

  return getRequisition(requisitionId);
}

export function submitRequisition(requisitionId: string, actor?: EventActor) {
  return updateRequisitionState(requisitionId, "Submitted", actor);
}

export function approveRequisition(requisitionId: string, actor?: EventActor) {
  return updateRequisitionState(requisitionId, "Approved", actor);
}

export function rejectRequisition(requisitionId: string, actor?: EventActor) {
  return updateRequisitionState(requisitionId, "Rejected", actor);
}

export function cancelRequisition(requisitionId: string, actor?: EventActor) {
  return updateRequisitionState(requisitionId, "Cancelled", actor);
}
