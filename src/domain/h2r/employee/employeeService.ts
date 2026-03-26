import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type EmployeeStatus = "Active" | "OnLeave" | "Terminated";

const employeeTransitions: Record<EmployeeStatus, EmployeeStatus[]> = {
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

export function createEmployee(input: { name: string; email: string }) {
  const employeeId = newId("EMP-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_employee(employee_id, name, email, status, hire_date, termination_date, created_at, updated_at)
       VALUES (?, ?, ?, 'Active', ?, NULL, ?, ?)`
    ).run(employeeId, input.name, input.email, timestamp, timestamp, timestamp);

    appendEvent({
      entityId: employeeId,
      entityType: "Employee",
      eventType: "EmployeeHired",
      version: 1,
      payload: { name: input.name, email: input.email }
    });
  });

  return getEmployeeById(employeeId);
}

function updateEmployeeStatus(employeeId: string, toStatus: EmployeeStatus, eventType: string) {
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
      payload: { from: employee.status, to: toStatus }
    });
  });

  return getEmployeeById(employeeId);
}

export function placeEmployeeOnLeave(employeeId: string) {
  return updateEmployeeStatus(employeeId, "OnLeave", "EmployeeOnLeave");
}

export function returnEmployeeFromLeave(employeeId: string) {
  return updateEmployeeStatus(employeeId, "Active", "EmployeeReturned");
}

export function terminateEmployee(employeeId: string) {
  return updateEmployeeStatus(employeeId, "Terminated", "EmployeeTerminated");
}

export function ensureEmployeeExists(employeeId: string) {
  getEmployeeById(employeeId);
}
