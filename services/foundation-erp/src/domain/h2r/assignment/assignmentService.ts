import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type AssignmentState = "Planned" | "Active" | "Completed" | "Cancelled";

const assignmentTransitions: Record<AssignmentState, AssignmentState[]> = {
  Planned: ["Active", "Cancelled"],
  Active: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

export function getAssignmentById(assignmentId: string) {
  const row = db
    .prepare("SELECT * FROM h2r_assignment WHERE assignment_id = ?")
    .get(assignmentId) as
    | { assignment_id: string; state: AssignmentState }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Assignment not found");
  }

  return row;
}

export function listAssignments(employeeId?: string) {
  if (employeeId) {
    return db
      .prepare("SELECT * FROM h2r_assignment WHERE employee_id = ?")
      .all(employeeId);
  }
  return db.prepare("SELECT * FROM h2r_assignment").all();
}

export function createAssignment(
  input: {
    employeeId: string;
    positionId: string;
    startDate?: string;
    endDate?: string;
    department?: string;
    role?: string;
  },
  actor?: EventActor
) {
  return transaction(() => {
    const existing = db
      .prepare(
        "SELECT assignment_id FROM h2r_assignment WHERE employee_id = ? AND state IN ('Planned','Active')"
      )
      .get(input.employeeId);

    if (existing) {
      throw new HttpError(
        409,
        "conflict",
        "Employee already has a Planned or Active assignment"
      );
    }

    const assignmentId = newId("ASGN-");
    const ts = now();

    db.prepare(
      `INSERT INTO h2r_assignment
         (assignment_id, employee_id, position_id, state, department, role,
          start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, 'Planned', ?, ?, ?, ?, ?, ?)`
    ).run(
      assignmentId,
      input.employeeId,
      input.positionId,
      input.department ?? null,
      input.role ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      ts,
      ts
    );

    appendEvent({
      entityId: assignmentId,
      entityType: "Assignment",
      eventType: "assignment.created",
      version: 1,
      payload: {
        employeeId: input.employeeId,
        positionId: input.positionId,
        department: input.department,
        role: input.role,
        startDate: input.startDate,
        endDate: input.endDate
      },
      actor
    });

    return getAssignmentById(assignmentId);
  });
}

function transitionAssignment(
  assignmentId: string,
  toState: AssignmentState,
  eventType: string,
  actor?: EventActor
) {
  return transaction(() => {
    const row = getAssignmentById(assignmentId);
    const allowed = assignmentTransitions[row.state as AssignmentState];

    if (!allowed.includes(toState)) {
      throw new HttpError(
        409,
        "invalid_transition",
        `Cannot transition assignment from ${row.state} to ${toState}`
      );
    }

    const ts = now();

    db.prepare(
      "UPDATE h2r_assignment SET state = ?, updated_at = ? WHERE assignment_id = ?"
    ).run(toState, ts, assignmentId);

    appendEvent({
      entityId: assignmentId,
      entityType: "Assignment",
      eventType,
      version: 1,
      payload: { from: row.state, to: toState },
      actor
    });

    return getAssignmentById(assignmentId);
  });
}

export function activateAssignment(assignmentId: string, actor?: EventActor) {
  return transitionAssignment(assignmentId, "Active", "assignment.activated", actor);
}

export function completeAssignment(assignmentId: string, actor?: EventActor) {
  return transitionAssignment(assignmentId, "Completed", "assignment.completed", actor);
}

export function cancelAssignment(assignmentId: string, actor?: EventActor) {
  return transitionAssignment(assignmentId, "Cancelled", "assignment.cancelled", actor);
}

/** @deprecated Use completeAssignment instead */
export function endAssignment(assignmentId: string, actor?: EventActor) {
  return completeAssignment(assignmentId, actor);
}
