import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureEmployeeExists } from "../employee/employeeService";
import { ensurePositionExists } from "../position/positionService";

type AssignmentState = "Active" | "Ended";

const assignmentTransitions: Record<AssignmentState, AssignmentState[]> = {
  Active: ["Ended"],
  Ended: []
};

function now(): string {
  return new Date().toISOString();
}

export function getAssignmentById(assignmentId: string) {
  const row = db.prepare("SELECT * FROM h2r_assignment WHERE assignment_id = ?").get(assignmentId) as
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
      .prepare("SELECT * FROM h2r_assignment WHERE employee_id = ? ORDER BY created_at DESC LIMIT 200")
      .all(employeeId);
  }

  return db.prepare("SELECT * FROM h2r_assignment ORDER BY created_at DESC LIMIT 200").all();
}

export function createAssignment(input: { employeeId: string; positionId: string }) {
  ensureEmployeeExists(input.employeeId);
  ensurePositionExists(input.positionId);

  const activeAssignment = db
    .prepare("SELECT assignment_id FROM h2r_assignment WHERE employee_id = ? AND state = 'Active'")
    .get(input.employeeId);

  if (activeAssignment) {
    throw new HttpError(409, "invalid_transition", "Employee already has an active assignment");
  }

  const assignmentId = newId("ASG-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_assignment(assignment_id, employee_id, position_id, state, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, 'Active', ?, NULL, ?, ?)`
    ).run(assignmentId, input.employeeId, input.positionId, timestamp, timestamp, timestamp);

    appendEvent({
      entityId: assignmentId,
      entityType: "Assignment",
      eventType: "AssignmentCreated",
      version: 1,
      payload: input
    });
  });

  return getAssignmentById(assignmentId);
}

export function endAssignment(assignmentId: string) {
  const assignment = getAssignmentById(assignmentId);
  if (!assignmentTransitions[assignment.state].includes("Ended")) {
    throw new HttpError(409, "invalid_transition", `Cannot transition assignment from ${assignment.state} to Ended`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE h2r_assignment SET state = 'Ended', end_date = ?, updated_at = ? WHERE assignment_id = ?")
      .run(timestamp, timestamp, assignmentId);

    appendEvent({
      entityId: assignmentId,
      entityType: "Assignment",
      eventType: "AssignmentEnded",
      version: 1,
      payload: { from: assignment.state, to: "Ended" }
    });
  });

  return getAssignmentById(assignmentId);
}
