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

export function getEmployeeSkillById(skillId: string) {
  const row = db.prepare("SELECT * FROM h2r_employee_skill WHERE skill_id = ?").get(skillId) as
    | { skill_id: string; employee_id: string; skill_name: string; proficiency: string | null; created_at: string; updated_at: string }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Employee skill not found");
  }

  return row;
}

export function getEmployeeAvailabilityById(availabilityId: string) {
  const row = db.prepare("SELECT * FROM h2r_employee_availability WHERE availability_id = ?").get(availabilityId) as
    | { availability_id: string; employee_id: string; work_date: string; available_hours: number; created_at: string; updated_at: string }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Employee availability not found");
  }

  return row;
}

export function employeeHasSkill(employeeId: string, skillName: string): boolean {
  const normalizedSkill = skillName.trim();
  if (!normalizedSkill) {
    return false;
  }

  const row = db
    .prepare("SELECT 1 FROM h2r_employee_skill WHERE employee_id = ? AND LOWER(skill_name) = LOWER(?) LIMIT 1")
    .get(employeeId, normalizedSkill) as { 1: number } | undefined;

  return Boolean(row);
}

export function getEmployeeAvailability(employeeId: string, workDate: string) {
  return db
    .prepare("SELECT * FROM h2r_employee_availability WHERE employee_id = ? AND work_date = ?")
    .get(employeeId, workDate) as
    | { availability_id: string; employee_id: string; work_date: string; available_hours: number; created_at: string; updated_at: string }
    | undefined;
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

export function addEmployeeSkill(
  employeeId: string,
  input: { skillName: string; proficiency?: string },
  actor?: EventActor
) {
  ensureEmployeeExists(employeeId);

  const skillName = input.skillName?.trim();
  if (!skillName) {
    throw new HttpError(400, "invalid_request", "skillName is required");
  }

  const skillId = newId("SKILL-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_employee_skill(skill_id, employee_id, skill_name, proficiency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(skillId, employeeId, skillName, input.proficiency ?? null, timestamp, timestamp);

    appendEvent({
      entityId: employeeId,
      entityType: "Employee",
      eventType: "employee.skill_added",
      version: 1,
      actor,
      payload: { skillId, employeeId, skillName, proficiency: input.proficiency ?? null }
    });
  });

  return getEmployeeSkillById(skillId);
}

export function setEmployeeAvailability(
  employeeId: string,
  input: { workDate: string; availableHours: number },
  actor?: EventActor
) {
  ensureEmployeeExists(employeeId);

  const workDate = String(input.workDate ?? "").trim();
  if (!workDate) {
    throw new HttpError(400, "invalid_request", "workDate is required");
  }

  const availableHours = Number(input.availableHours);
  if (!Number.isFinite(availableHours) || availableHours < 0) {
    throw new HttpError(400, "invalid_request", "availableHours must be a non-negative number");
  }

  const availabilityId = newId("AVAIL-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_employee_availability(availability_id, employee_id, work_date, available_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, work_date)
       DO UPDATE SET available_hours = excluded.available_hours, updated_at = excluded.updated_at`
    ).run(availabilityId, employeeId, workDate, availableHours, timestamp, timestamp);

    appendEvent({
      entityId: employeeId,
      entityType: "Employee",
      eventType: "employee.availability_updated",
      version: 1,
      actor,
      payload: { availabilityId, employeeId, workDate, availableHours }
    });
  });

  return getEmployeeAvailabilityById(availabilityId);
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
