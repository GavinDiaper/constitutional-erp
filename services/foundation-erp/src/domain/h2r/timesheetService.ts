/**
 * Timesheet Service - H2R Labor Cost aggregate
 * Handles timesheet creation, line entry, approval workflow, and project labor posting
 */

import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

type TimesheetStatus = "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
type ApprovalStatus = "Pending" | "Approved" | "Rejected";
type LaborRateFrom = "EmployeeOverride" | "RoleDefault" | "LookupCard";
type ProjectStatus = "Draft" | "Active" | "OnHold" | "Completed" | "Cancelled";

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

interface TimesheetRow {
  timesheet_id: string;
  organization_id: string;
  employee_id: string;
  timesheet_period_start: string;
  timesheet_period_end: string;
  total_hours: number;
  total_cost: number;
  status: TimesheetStatus;
  approval_status: ApprovalStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  line_count: number;
  created_by: string;
  created_at: string;
  version: number;
}

interface TimesheetLineRow {
  timesheet_line_id: string;
  timesheet_id: string;
  line_number: number;
  project_id: string | null;
  cost_element_id: string;
  work_date: string;
  hours: number;
  quantity_uom: string;
  labor_rate_from: LaborRateFrom;
  hourly_rate: number;
  line_cost: number;
  description: string | null;
  created_by: string;
  created_at: string;
  version: number;
}

interface CostElementRow {
  cost_element_id: string;
  is_active: number;
}

interface ProjectRow {
  project_id: string;
  status: ProjectStatus;
}

interface ProjectWIPRow {
  wip_id: string;
  project_id: string;
  status: "Open" | "Closed";
  version: number;
}

export interface TimesheetLineProjection {
  lineId: string;
  lineNumber: number;
  projectId?: string;
  costElementId: string;
  workDate: string;
  hours: number;
  quantityUom: string;
  laborRateFrom: LaborRateFrom;
  hourlyRate: number;
  lineCost: number;
  description?: string;
  createdBy: string;
  createdAt: string;
  version: number;
  status: TimesheetStatus;
}

export interface TimesheetProjection {
  timesheetId: string;
  organizationId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalCost: number;
  status: TimesheetStatus;
  approvalStatus: ApprovalStatus;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lineCount: number;
  lines: TimesheetLineProjection[];
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface AddTimesheetLineInput {
  timesheetId: string;
  projectId?: string;
  costElementId: string;
  workDate: string;
  hours: number;
  hourlyRate: number;
  description?: string;
  laborRateFrom?: LaborRateFrom;
}

function getTimesheetRow(timesheetId: string): TimesheetRow {
  const row = db
    .prepare("SELECT * FROM h2r_timesheet WHERE timesheet_id = ?")
    .get(timesheetId) as TimesheetRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Timesheet not found");
  }

  return row;
}

function getTimesheetLineRows(timesheetId: string): TimesheetLineRow[] {
  return db
    .prepare("SELECT * FROM h2r_timesheet_line WHERE timesheet_id = ? ORDER BY line_number ASC")
    .all(timesheetId) as TimesheetLineRow[];
}

function rowToTimesheetLineProjection(row: TimesheetLineRow, status: TimesheetStatus): TimesheetLineProjection {
  return {
    lineId: row.timesheet_line_id,
    lineNumber: row.line_number,
    projectId: row.project_id ?? undefined,
    costElementId: row.cost_element_id,
    workDate: row.work_date,
    hours: row.hours,
    quantityUom: row.quantity_uom,
    laborRateFrom: row.labor_rate_from,
    hourlyRate: row.hourly_rate,
    lineCost: row.line_cost,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
    status
  };
}

function rowToTimesheetProjection(row: TimesheetRow, lines: TimesheetLineRow[]): TimesheetProjection {
  return {
    timesheetId: row.timesheet_id,
    organizationId: row.organization_id,
    employeeId: row.employee_id,
    periodStart: row.timesheet_period_start,
    periodEnd: row.timesheet_period_end,
    totalHours: row.total_hours,
    totalCost: row.total_cost,
    status: row.status,
    approvalStatus: row.approval_status,
    submittedBy: row.submitted_by ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    lineCount: row.line_count,
    lines: lines.map((line) => rowToTimesheetLineProjection(line, row.status)),
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version
  };
}

function getActiveCostElement(costElementId: string): CostElementRow {
  const row = db
    .prepare("SELECT cost_element_id, is_active FROM r2r_cost_element WHERE cost_element_id = ?")
    .get(costElementId) as CostElementRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Cost element not found");
  }

  if (!row.is_active) {
    throw new HttpError(400, "invalid_state", "Cost element must be active");
  }

  return row;
}

function getProject(projectId: string): ProjectRow {
  const row = db
    .prepare("SELECT project_id, status FROM proj_project WHERE project_id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Project not found");
  }

  return row;
}

function requireActiveProject(projectId: string): ProjectRow {
  const project = getProject(projectId);
  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", "Project must be Active for timesheet labor posting");
  }
  return project;
}

function getOpenProjectWip(projectId: string): ProjectWIPRow {
  const row = db
    .prepare("SELECT wip_id, project_id, status, version FROM proj_wip WHERE project_id = ? AND status = 'Open'")
    .get(projectId) as ProjectWIPRow | undefined;

  if (!row) {
    throw new HttpError(409, "wip_not_found", "No open WIP record found for this project");
  }

  return row;
}

function validateDateRange(periodStart: string, periodEnd: string): void {
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new HttpError(400, "invalid_request", "periodStart and periodEnd must be valid ISO dates");
  }

  if (start > end) {
    throw new HttpError(400, "invalid_request", "periodStart must be on or before periodEnd");
  }
}

function validateWorkDate(workDate: string, periodStart: string, periodEnd: string): void {
  const workTime = Date.parse(workDate);
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);

  if (!Number.isFinite(workTime)) {
    throw new HttpError(400, "invalid_request", "workDate must be a valid ISO date");
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || workTime < start || workTime > end) {
    throw new HttpError(400, "invalid_request", "workDate must fall within the timesheet period");
  }
}

function validateLineInput(input: AddTimesheetLineInput, timesheet: TimesheetRow): void {
  if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
    throw new HttpError(400, "invalid_request", "hours must be greater than 0 and less than or equal to 24");
  }

  if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) {
    throw new HttpError(400, "invalid_request", "hourlyRate must be a non-negative number");
  }

  validateWorkDate(input.workDate, timesheet.timesheet_period_start, timesheet.timesheet_period_end);
  getActiveCostElement(input.costElementId);

  if (input.projectId) {
    requireActiveProject(input.projectId);
  }
}

function assertTimesheetCanSubmit(timesheet: TimesheetRow, lines: TimesheetLineRow[]): void {
  if (timesheet.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "Timesheet must be in Draft to submit");
  }

  if (lines.length === 0) {
    throw new HttpError(400, "invalid_request", "Timesheet must contain at least one line before submit");
  }

  if (timesheet.total_hours <= 0) {
    throw new HttpError(400, "invalid_request", "Timesheet total hours must be greater than zero");
  }

  for (const line of lines) {
    getActiveCostElement(line.cost_element_id);
    if (line.project_id) {
      requireActiveProject(line.project_id);
    }
  }
}

export function createTimesheet(
  input: {
    organizationId: string;
    employeeId: string;
    periodStart: string;
    periodEnd: string;
  },
  actor?: EventActor
): TimesheetProjection {
  validateDateRange(input.periodStart, input.periodEnd);

  const employee = db
    .prepare("SELECT employee_id FROM h2r_employee WHERE employee_id = ?")
    .get(input.employeeId) as { employee_id: string } | undefined;

  if (!employee) {
    throw new HttpError(404, "not_found", "Employee not found");
  }

  const timesheetId = newId("TS-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_timesheet(
        timesheet_id, organization_id, employee_id,
        timesheet_period_start, timesheet_period_end,
        timesheet_period_year, timesheet_period_month,
        total_hours, total_cost,
        status, approval_status,
        line_count, created_by, created_at, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      timesheetId,
      input.organizationId,
      input.employeeId,
      input.periodStart,
      input.periodEnd,
      new Date(input.periodStart).getUTCFullYear(),
      new Date(input.periodStart).getUTCMonth() + 1,
      0,
      0,
      "Draft",
      "Pending",
      0,
      actor?.id ?? "system",
      timestamp,
      1,
      timestamp
    );

    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_created",
      version: 1,
      actor,
      payload: {
        timesheetId,
        employeeId: input.employeeId,
        organizationId: input.organizationId,
        timePeriodStart: input.periodStart,
        timePeriodEnd: input.periodEnd
      } as Record<string, unknown>
    });
  });

  return getTimesheetById(timesheetId) as TimesheetProjection;
}

export function addTimesheetLine(input: AddTimesheetLineInput, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetRow(input.timesheetId);
  if (timesheet.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "Timesheet must be in Draft to add lines");
  }

  validateLineInput(input, timesheet);

  const lineId = newId("TSL-");
  const timestamp = now();
  const lineNumber =
    ((db
      .prepare("SELECT COALESCE(MAX(line_number), 0) AS max_line_number FROM h2r_timesheet_line WHERE timesheet_id = ?")
      .get(input.timesheetId) as { max_line_number: number } | undefined)?.max_line_number ?? 0) + 1;
  const lineCost = roundMoney(input.hours * input.hourlyRate);
  const laborRateFrom = input.laborRateFrom ?? "EmployeeOverride";

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_timesheet_line(
        timesheet_line_id, timesheet_id, line_number, project_id, cost_element_id,
        work_date, hours, quantity_uom, labor_rate_from, hourly_rate, line_cost,
        description, created_by, created_at, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      lineId,
      input.timesheetId,
      lineNumber,
      input.projectId ?? null,
      input.costElementId,
      input.workDate,
      input.hours,
      "Hour",
      laborRateFrom,
      input.hourlyRate,
      lineCost,
      input.description ?? null,
      actor?.id ?? "system",
      timestamp,
      1,
      timestamp
    );

    db.prepare(
      `UPDATE h2r_timesheet
       SET total_hours = total_hours + ?,
           total_cost = total_cost + ?,
           line_count = line_count + 1,
           version = version + 1,
           updated_at = ?
       WHERE timesheet_id = ?`
    ).run(input.hours, lineCost, timestamp, input.timesheetId);

    appendEvent({
      entityId: input.timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_line_added",
      version: timesheet.version + 1,
      actor,
      payload: {
        timesheetId: input.timesheetId,
        lineId,
        workDate: input.workDate,
        hours: input.hours,
        projectId: input.projectId,
        costElement: input.costElementId,
        description: input.description,
        hourlyRate: input.hourlyRate,
        laborRateFrom
      } as Record<string, unknown>
    });
  });

  return getTimesheetById(input.timesheetId) as TimesheetProjection;
}

export function listTimesheetLines(timesheetId: string): TimesheetLineProjection[] {
  const timesheet = getTimesheetRow(timesheetId);
  return getTimesheetLineRows(timesheetId).map((line) => rowToTimesheetLineProjection(line, timesheet.status));
}

export function submitTimesheet(timesheetId: string, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetRow(timesheetId);
  const lines = getTimesheetLineRows(timesheetId);
  assertTimesheetCanSubmit(timesheet, lines);

  const timestamp = now();
  transaction(() => {
    db.prepare(
      `UPDATE h2r_timesheet
       SET status = ?, submitted_by = ?, submitted_at = ?, version = version + 1, updated_at = ?
       WHERE timesheet_id = ?`
    ).run("Submitted", actor?.id ?? "system", timestamp, timestamp, timesheetId);

    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_submitted",
      version: timesheet.version + 1,
      actor,
      payload: {
        timesheetId,
        employeeId: timesheet.employee_id,
        timePeriodStart: timesheet.timesheet_period_start,
        timePeriodEnd: timesheet.timesheet_period_end,
        totalHours: timesheet.total_hours,
        totalCost: timesheet.total_cost,
        lineCount: timesheet.line_count,
        submittedAt: timestamp
      } as Record<string, unknown>
    });
  });

  return getTimesheetById(timesheetId) as TimesheetProjection;
}

export function approveTimesheet(timesheetId: string, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetRow(timesheetId);
  if (timesheet.status !== "Submitted") {
    throw new HttpError(400, "invalid_state", "Timesheet must be Submitted to approve");
  }

  const lines = getTimesheetLineRows(timesheetId);
  if (lines.length === 0) {
    throw new HttpError(400, "invalid_request", "Timesheet must contain at least one line to approve");
  }

  const projectLines = lines.filter((line) => line.project_id);
  const wipByProjectId = new Map<string, ProjectWIPRow>();
  for (const line of projectLines) {
    getActiveCostElement(line.cost_element_id);
    const projectId = line.project_id as string;
    requireActiveProject(projectId);
    if (!wipByProjectId.has(projectId)) {
      wipByProjectId.set(projectId, getOpenProjectWip(projectId));
    }
  }

  const timestamp = now();
  const resultingStatus: TimesheetStatus = projectLines.length > 0 ? "Posted" : "Approved";
  const wipEventVersions = new Map<string, number>();
  for (const [projectId, wip] of wipByProjectId.entries()) {
    wipEventVersions.set(projectId, wip.version);
  }

  transaction(() => {
    db.prepare(
      `UPDATE h2r_timesheet
       SET status = ?, approval_status = ?, approved_by = ?, approved_at = ?, version = version + 1, updated_at = ?
       WHERE timesheet_id = ?`
    ).run(resultingStatus, "Approved", actor?.id ?? "system", timestamp, timestamp, timesheetId);

    for (const line of projectLines) {
      const projectId = line.project_id as string;
      const wip = wipByProjectId.get(projectId) as ProjectWIPRow;
      const entryId = newId("LABR");
      const totalCost = roundMoney(line.line_cost);

      db.prepare(
        `INSERT INTO proj_labor_entry(entry_id, project_id, wip_id, wbs_id, resource_id, hours, rate, total_cost, cost_element_id, posted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        entryId,
        projectId,
        wip.wip_id,
        null,
        timesheet.employee_id,
        line.hours,
        line.hourly_rate,
        totalCost,
        line.cost_element_id,
        timestamp,
        timestamp
      );

      db.prepare(
        `UPDATE proj_wip
         SET wip_labor_balance = wip_labor_balance + ?,
             wip_total_balance = wip_total_balance + ?,
             labor_line_count = labor_line_count + 1,
             last_labor_posted_at = ?,
             version = version + 1
         WHERE wip_id = ?`
      ).run(totalCost, totalCost, timestamp, wip.wip_id);

      db.prepare(
        `UPDATE proj_project
         SET wip_labor_balance = wip_labor_balance + ?,
             wip_total_balance = wip_total_balance + ?,
             actual_cost_amount = actual_cost_amount + ?,
             version = version + 1,
             last_event_at = ?
         WHERE project_id = ?`
      ).run(totalCost, totalCost, totalCost, timestamp, projectId);

      const nextWipVersion = (wipEventVersions.get(projectId) ?? wip.version) + 1;
      wipEventVersions.set(projectId, nextWipVersion);

      appendEvent({
        entityId: wip.wip_id,
        entityType: "project_wip",
        eventType: "proj.wip_labor_posted",
        version: nextWipVersion,
        actor,
        governance: {
          riskLevel: "Medium",
          requiredTier: 1,
          governanceTag: "project_wip_labor_post"
        },
        payload: {
          wipId: wip.wip_id,
          projectId,
          timesheetLineId: line.timesheet_line_id,
          employeeId: timesheet.employee_id,
          hours: line.hours,
          hourlyRate: line.hourly_rate,
          totalCost,
          costElement: line.cost_element_id,
          postedAt: timestamp,
          timesheetId
        } as Record<string, unknown>
      });
    }

    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_approved",
      version: timesheet.version + 1,
      actor,
      governance: {
        riskLevel: "Medium",
        requiredTier: 1
      },
      payload: {
        timesheetId,
        employeeId: timesheet.employee_id,
        approvedBy: actor?.id ?? "system",
        approvedAt: timestamp,
        totalHours: timesheet.total_hours,
        totalCost: timesheet.total_cost,
        approvedLines: lines.map((line) => ({
          lineId: line.timesheet_line_id,
          workDate: line.work_date,
          hours: line.hours,
          rate: line.hourly_rate,
          cost: line.line_cost,
          projectId: line.project_id ?? undefined,
          costElement: line.cost_element_id
        }))
      } as Record<string, unknown>
    });
  });

  return getTimesheetById(timesheetId) as TimesheetProjection;
}

export function getTimesheetById(timesheetId: string): TimesheetProjection | null {
  const row = db
    .prepare("SELECT * FROM h2r_timesheet WHERE timesheet_id = ?")
    .get(timesheetId) as TimesheetRow | undefined;

  if (!row) {
    return null;
  }

  return rowToTimesheetProjection(row, getTimesheetLineRows(timesheetId));
}

export function listTimesheets(organizationId: string, limit = 100, offset = 0): TimesheetProjection[] {
  const rows = db
    .prepare(
      "SELECT * FROM h2r_timesheet WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(organizationId, limit, offset) as TimesheetRow[];

  return rows.map((row) => rowToTimesheetProjection(row, getTimesheetLineRows(row.timesheet_id)));
}
