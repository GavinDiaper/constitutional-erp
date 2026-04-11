import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type EmployeeStatus = "Candidate" | "Active" | "OnLeave" | "Terminated";

const employeeTransitions: Record<EmployeeStatus, EmployeeStatus[]> = {
  Candidate: ["Active"],
  Active: ["OnLeave", "Terminated"],
  OnLeave: ["Active", "Terminated"],
  Terminated: []
};

function now(): string {
  return new Date().toISOString();
}

export function getEmployeeById(employeeId: string) {
  const row = db.prepare("SELECT * FROM h2r_employee WHERE employee_id = ?").get(employeeId) as
    | { employee_id: string; status: EmployeeStatus }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Employee not found");
  }

  return row;
}

export function listEmployees() {
  return db.prepare("SELECT * FROM h2r_employee ORDER BY created_at DESC LIMIT 200").all();
}

type CreateEmployeeInput = {
  name: string;
  email: string;
  active?: boolean;
  status?: "Candidate" | "Active";
};

function resolveInitialEmployeeStatus(input: CreateEmployeeInput): "Candidate" | "Active" {
  if (input.status === "Candidate" || input.status === "Active") {
    return input.status;
  }

  if (typeof input.active === "boolean") {
    return input.active ? "Active" : "Candidate";
  }

  return "Candidate";
}

function isLegacyCandidateConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("CHECK constraint failed") && message.includes("h2r_employee");
}

function insertEmployee(
  employeeId: string,
  input: CreateEmployeeInput,
  status: "Candidate" | "Active",
  actor: EventActor | undefined,
  timestamp: string
) {
  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_employee(employee_id, name, email, status, hire_date, termination_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(employeeId, input.name, input.email, status, timestamp, timestamp, timestamp);

    appendEvent({
      entityId: employeeId,
      entityType: "Employee",
      eventType: "employee.created",
      version: 1,
      actor,
      payload: { name: input.name, email: input.email, status }
    });
  });
}

export function createEmployee(input: CreateEmployeeInput, actor?: EventActor) {
  const employeeId = newId("EMP-");
  const timestamp = now();
  const initialStatus = resolveInitialEmployeeStatus(input);

  try {
    insertEmployee(employeeId, input, initialStatus, actor, timestamp);
  } catch (error) {
    if (initialStatus === "Candidate" && isLegacyCandidateConstraintError(error)) {
      insertEmployee(employeeId, input, "Active", actor, timestamp);
    } else {
      throw error;
    }
  }

  return getEmployeeById(employeeId);
}

export function activateEmployee(employeeId: string, actor?: EventActor) {
  const employee = getEmployeeById(employeeId);
  if (employee.status !== "Candidate") {
    throw new HttpError(409, "invalid_transition", `Cannot activate employee in status ${employee.status}`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE h2r_employee SET status = 'Active', hire_date = ?, updated_at = ? WHERE employee_id = ?")
      .run(timestamp, timestamp, employeeId);

    appendEvent({
      entityId: employeeId,
      entityType: "Employee",
      eventType: "employee.activated",
      version: 1,
      actor,
      payload: {}
    });
  });

  return getEmployeeById(employeeId);
}

function updateEmployeeStatus(employeeId: string, toStatus: EmployeeStatus, eventType: string, actor?: EventActor) {
  const employee = getEmployeeById(employeeId);
  if (!employeeTransitions[employee.status].includes(toStatus)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition employee from ${employee.status} to ${toStatus}`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE h2r_employee
       SET status = ?,
           termination_date = CASE WHEN ? = 'Terminated' THEN ? ELSE termination_date END,
           updated_at = ?
       WHERE employee_id = ?`
    ).run(toStatus, toStatus, timestamp, timestamp, employeeId);

    appendEvent({
      entityId: employeeId,
      entityType: "Employee",
      eventType,
      version: 1,
      actor,
      payload: { from: employee.status, to: toStatus }
    });
  });

  return getEmployeeById(employeeId);
}

export function placeEmployeeOnLeave(employeeId: string, actor?: EventActor) {
  return updateEmployeeStatus(employeeId, "OnLeave", "employee.on_leave", actor);
}

export function returnEmployeeFromLeave(employeeId: string, actor?: EventActor) {
  return updateEmployeeStatus(employeeId, "Active", "employee.returned", actor);
}

export function terminateEmployee(employeeId: string, actor?: EventActor) {
  return updateEmployeeStatus(employeeId, "Terminated", "employee.terminated", actor);
}

export function ensureEmployeeExists(employeeId: string) {
  getEmployeeById(employeeId);
}
