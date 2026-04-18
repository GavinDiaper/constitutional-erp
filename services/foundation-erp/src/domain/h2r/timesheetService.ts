/**
 * Timesheet Service - H2R Labor Cost aggregate
 * Handles timesheet creation, line addition, approval workflow
 */

import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

function now(): string {
  return new Date().toISOString();
}

interface TimesheetRow {
  timesheet_id: string;
  organization_id: string;
  employee_id: string;
  timesheet_period_start: string;
  timesheet_period_end: string;
  total_hours: number;
  total_cost: number;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
  approval_status: "Pending" | "Approved" | "Rejected";
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  line_count: number;
  created_by: string;
  created_at: string;
  version: number;
}

export interface TimesheetProjection {
  timesheetId: string;
  organizationId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalCost: number;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
  approvalStatus: "Pending" | "Approved" | "Rejected";
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lineCount: number;
  createdBy: string;
  createdAt: string;
  version: number;
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
  const timesheetId = newId("TS-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO h2r_timesheet(
          timesheet_id, organization_id, employee_id,
          timesheet_period_start, timesheet_period_end,
          timesheet_period_year, timesheet_period_month,
          total_hours, total_cost,
          status, approval_status,
          line_count, created_by, created_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        timesheetId,
        input.organizationId,
        input.employeeId,
        input.periodStart,
        input.periodEnd,
        new Date(input.periodStart).getFullYear(),
        new Date(input.periodStart).getMonth() + 1,
        0,
        0,
        "Draft",
        "Pending",
        0,
        actor?.id ?? "system",
        timestamp,
        1
      );

      appendEvent({
        entityId: timesheetId,
        entityType: "timesheet",
        eventType: "h2r.timesheet_created",
        version: 1,
        actor,
        payload: {
          timesheetId,
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        } as unknown as Record<string, unknown>,
      });
    });
  } catch (err: unknown) {
    throw err;
  }

  return getTimesheetById(timesheetId) as TimesheetProjection;
}

export function submitTimesheet(timesheetId: string, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetById(timesheetId);
  if (!timesheet) {
    throw new HttpError(404, "not_found", "Timesheet not found");
  }
  if (timesheet.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "Timesheet must be in Draft to submit");
  }

  const timestamp = now();
  transaction(() => {
    db.prepare(
      `UPDATE h2r_timesheet SET status = ?, submitted_by = ?, submitted_at = ?, version = version + 1 
       WHERE timesheet_id = ?`
    ).run("Submitted", actor?.id ?? "system", timestamp, timesheetId);

    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_submitted",
      version: timesheet.version + 1,
      actor,
      payload: {
        timesheetId,
        submittedAt: timestamp,
      } as unknown as Record<string, unknown>,
    });
  });

  return getTimesheetById(timesheetId) as TimesheetProjection;
}

export function approveTimesheet(timesheetId: string, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetById(timesheetId);
  if (!timesheet) {
    throw new HttpError(404, "not_found", "Timesheet not found");
  }
  if (timesheet.status !== "Submitted") {
    throw new HttpError(400, "invalid_state", "Timesheet must be Submitted to approve");
  }

  const timestamp = now();
  transaction(() => {
    db.prepare(
      `UPDATE h2r_timesheet SET status = ?, approval_status = ?, approved_by = ?, approved_at = ?, version = version + 1 
       WHERE timesheet_id = ?`
    ).run("Approved", "Approved", actor?.id ?? "system", timestamp, timesheetId);

    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_approved",
      version: timesheet.version + 1,
      actor,
      governance: {
        riskLevel: "Medium",
        requiredTier: 1,
      },
      payload: {
        timesheetId,
        approvedAt: timestamp,
        totalHours: timesheet.totalHours,
        totalCost: timesheet.totalCost,
      } as unknown as Record<string, unknown>,
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
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  };
}

export function listTimesheets(organizationId: string, limit = 100, offset = 0) {
  const rows = db
    .prepare(
      "SELECT * FROM h2r_timesheet WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(organizationId, limit, offset) as TimesheetRow[];

  return rows.map((row) => ({
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
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  }));
}
