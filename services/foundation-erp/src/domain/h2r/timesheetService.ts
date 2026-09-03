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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ensureLaborCostElement(organizationId: string, costElementId: string, projectId?: string) {
  const existing = db
    .prepare("SELECT cost_element_id FROM r2r_cost_element WHERE cost_element_id = ?")
    .get(costElementId) as { cost_element_id: string } | undefined;

  if (existing) {
    return;
  }

  const defaultGlAccount = projectId
    ? (db.prepare("SELECT default_close_account_id AS gl_account_id FROM proj_project WHERE project_id = ?").get(projectId) as { gl_account_id: string } | undefined)?.gl_account_id
    : undefined;

  const fallbackGlAccount = defaultGlAccount
    ?? (db.prepare("SELECT account_id AS gl_account_id FROM r2r_account ORDER BY created_at LIMIT 1").get() as { gl_account_id: string } | undefined)?.gl_account_id
    ?? "ACC-LABOR-DEFAULT";

  db.prepare(
    `INSERT INTO r2r_cost_element(
      cost_element_id, organization_id, cost_element_name, cost_element_type,
      cost_category, gl_account_id, tax_code_id, allocation_method,
      is_active, created_by, created_at, version
    ) VALUES (?, ?, ?, 'Labor', 'Standard', ?, NULL, 'Direct', 1, 'system', ?, 1)`
  ).run(costElementId, organizationId, costElementId, fallbackGlAccount, now());
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

interface VendorRateRow {
  vendor_rate_id: string;
  contractor_id: string;
  vendor_name: string;
  role: string;
  hourly_rate: number;
  currency: string;
  effective_from: string;
  effective_until: string | null;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at: string;
}

export interface VendorRateProjection {
  vendorRateId: string;
  contractorId: string;
  vendorName: string;
  role: string;
  hourlyRate: number;
  currency: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

interface TimesheetLineRow {
  timesheet_line_id: string;
  timesheet_id: string;
  line_number: number;
  project_id: string | null;
  task_id: string | null;
  resource_id: string | null;
  resource_type: "employee" | "contractor" | null;
  vendor_rate_id: string | null;
  cost_element_id: string;
  work_date: string;
  hours: number;
  quantity_uom: string;
  labor_rate_from: string;
  hourly_rate: number;
  line_cost: number;
  description: string | null;
  created_by: string;
  created_at: string;
  version: number;
  updated_at: string;
}

export interface TimesheetLineProjection {
  timesheetLineId: string;
  timesheetId: string;
  lineNumber: number;
  projectId?: string;
  taskId?: string;
  resourceId?: string;
  resourceType?: "employee" | "contractor";
  vendorRateId?: string;
  costElementId: string;
  workDate: string;
  hours: number;
  quantityUom: string;
  hourlyRate: number;
  lineCost: number;
  description?: string;
  createdBy: string;
  createdAt: string;
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

function rowToVendorRate(row: VendorRateRow): VendorRateProjection {
  return {
    vendorRateId: row.vendor_rate_id,
    contractorId: row.contractor_id,
    vendorName: row.vendor_name,
    role: row.role,
    hourlyRate: row.hourly_rate,
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createVendorRate(
  input: {
    contractorId: string;
    vendorName: string;
    role: string;
    hourlyRate: number;
    effectiveFrom: string;
    effectiveUntil?: string;
    currency?: string;
    status?: "Active" | "Inactive";
  },
  actor?: EventActor
): VendorRateProjection {
  if (!input.contractorId || input.contractorId.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "contractorId is required");
  }
  if (!input.vendorName || input.vendorName.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "vendorName is required");
  }
  if (!input.role || input.role.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "role is required");
  }
  const rate = Number(input.hourlyRate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new HttpError(400, "invalid_request", "hourlyRate must be a non-negative number");
  }

  const vendorRateId = newId("VRT-");
  const ts = now();
  const effectiveFrom = input.effectiveFrom?.trim() || ts;
  const effectiveUntil = input.effectiveUntil?.trim() || null;

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_vendor_rate(
        vendor_rate_id, contractor_id, vendor_name, role, hourly_rate, currency,
        effective_from, effective_until, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      vendorRateId,
      input.contractorId,
      input.vendorName,
      input.role,
      rate,
      input.currency ?? "USD",
      effectiveFrom,
      effectiveUntil,
      input.status ?? "Active",
      ts,
      ts
    );

    appendEvent({
      entityId: vendorRateId,
      entityType: "vendor_rate",
      eventType: "h2r.vendor_rate_created",
      version: 1,
      actor,
      payload: {
        vendorRateId,
        contractorId: input.contractorId,
        vendorName: input.vendorName,
        role: input.role,
        hourlyRate: rate,
        effectiveFrom,
        effectiveUntil,
      } as unknown as Record<string, unknown>,
    });
  });

  return getVendorRateById(vendorRateId)!;
}

export function getVendorRateById(vendorRateId: string): VendorRateProjection | null {
  const row = db.prepare("SELECT * FROM h2r_vendor_rate WHERE vendor_rate_id = ?").get(vendorRateId) as VendorRateRow | undefined;
  return row ? rowToVendorRate(row) : null;
}

export function listVendorRates(contractorId?: string): VendorRateProjection[] {
  const rows = contractorId
    ? db.prepare("SELECT * FROM h2r_vendor_rate WHERE contractor_id = ? ORDER BY created_at DESC").all(contractorId) as VendorRateRow[]
    : db.prepare("SELECT * FROM h2r_vendor_rate ORDER BY created_at DESC LIMIT 100").all() as VendorRateRow[];
  return rows.map(rowToVendorRate);
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

function rowToTimesheetLine(row: TimesheetLineRow): TimesheetLineProjection {
  return {
    timesheetLineId: row.timesheet_line_id,
    timesheetId: row.timesheet_id,
    lineNumber: row.line_number,
    projectId: row.project_id ?? undefined,
    taskId: row.task_id ?? undefined,
    resourceId: row.resource_id ?? undefined,
    resourceType: row.resource_type ?? undefined,
    vendorRateId: row.vendor_rate_id ?? undefined,
    costElementId: row.cost_element_id,
    workDate: row.work_date,
    hours: row.hours,
    quantityUom: row.quantity_uom,
    hourlyRate: row.hourly_rate,
    lineCost: row.line_cost,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  };
}

export function addTimesheetLine(
  timesheetId: string,
  input: {
    projectId?: string;
    taskId?: string;
    resourceId: string;
    resourceType?: "employee" | "contractor";
    vendorRateId?: string;
    workDate: string;
    hours: number;
    costElementId: string;
    description?: string;
    hourlyRate?: number;
  },
  actor?: EventActor
): TimesheetLineProjection {
  const timesheet = getTimesheetById(timesheetId);
  if (!timesheet) {
    throw new HttpError(404, "not_found", "Timesheet not found");
  }
  if (timesheet.status === "Approved" || timesheet.status === "Posted") {
    throw new HttpError(400, "invalid_state", "Cannot add timesheet lines once the timesheet is approved or posted");
  }

  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new HttpError(400, "invalid_request", "hours must be a positive number");
  }

  const resourceType = input.resourceType ?? "employee";
  const vendorRate = input.vendorRateId ? getVendorRateById(input.vendorRateId) : null;
  const effectiveRate = Number(input.hourlyRate ?? vendorRate?.hourlyRate ?? 0);
  if (!Number.isFinite(effectiveRate) || effectiveRate < 0) {
    throw new HttpError(400, "invalid_request", "hourlyRate must be a non-negative number");
  }
  if (resourceType === "contractor" && !vendorRate && effectiveRate === 0) {
    throw new HttpError(400, "invalid_request", "vendorRateId or hourlyRate is required for contractor entries");
  }

  const costElementId = (input.costElementId ?? "").trim();
  if (!costElementId) {
    throw new HttpError(400, "invalid_request", "costElementId is required");
  }

  if (input.taskId) {
    const task = db
      .prepare("SELECT * FROM proj_task WHERE task_id = ?")
      .get(input.taskId) as { project_id: string; assigned_to: string | null; actual_hours: number; remaining_hours: number; estimated_hours: number; status: string } | undefined;

    if (!task) {
      throw new HttpError(404, "not_found", "Task not found for timesheet entry");
    }
    if (input.projectId && task.project_id !== input.projectId) {
      throw new HttpError(409, "task_project_mismatch", "Task does not belong to the supplied project");
    }

    const taskAllocation = db
      .prepare(
        "SELECT * FROM proj_task_allocation WHERE task_id = ? AND resource_id = ? AND resource_type = ? LIMIT 1"
      )
      .get(input.taskId, input.resourceId, resourceType) as { allocation_id: string } | undefined;

    const isAssignedDirectly = task.assigned_to === input.resourceId;
    if (!taskAllocation && !isAssignedDirectly) {
      throw new HttpError(409, "task_assignment_required", "Resource is not assigned to the selected task");
    }
  }

  ensureLaborCostElement(timesheet.organizationId, costElementId, input.projectId);

  const lineId = newId("TSL-");
  const ts = now();
  const lineNumber = (db.prepare("SELECT COALESCE(MAX(line_number), 0) + 1 AS next_line FROM h2r_timesheet_line WHERE timesheet_id = ?").get(timesheetId) as { next_line: number } | undefined)?.next_line ?? 1;
  const lineCost = roundMoney(hours * effectiveRate);
  const quantityUom = "Hour";
  const laborRateSource = vendorRate ? "LookupCard" : "EmployeeOverride";

  const version = 1;

  transaction(() => {
    if (input.taskId) {
      const task = db
        .prepare("SELECT * FROM proj_task WHERE task_id = ?")
        .get(input.taskId) as { actual_hours: number; remaining_hours: number; estimated_hours: number; status: string } | undefined;

      if (task) {
        const updatedActualHours = roundMoney(Number(task.actual_hours ?? 0) + hours);
        const updatedRemaining = Math.max(0, roundMoney(Number(task.remaining_hours ?? 0) - hours));
        const updatedPercent = task.estimated_hours > 0 ? roundMoney((updatedActualHours / task.estimated_hours) * 100) : 100;
        const updatedStatus = updatedRemaining > 0 ? "InProgress" : "Completed";

        db.prepare(
          `UPDATE proj_task
           SET actual_hours = ?, remaining_hours = ?, percent_complete = ?, status = ?, updated_at = ?
           WHERE task_id = ?`
        ).run(updatedActualHours, updatedRemaining, updatedPercent, updatedStatus, ts, input.taskId);
      }
    }

    db.prepare(
      `INSERT INTO h2r_timesheet_line(
        timesheet_line_id, timesheet_id, line_number, project_id, task_id, resource_id, resource_type,
        vendor_rate_id, cost_element_id, work_date, hours, quantity_uom, labor_rate_from,
        hourly_rate, line_cost, description, created_by, created_at, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      lineId,
      timesheetId,
      lineNumber,
      input.projectId ?? null,
      input.taskId ?? null,
      input.resourceId,
      resourceType,
      input.vendorRateId ?? null,
      costElementId,
      input.workDate,
      hours,
      quantityUom,
      laborRateSource,
      effectiveRate,
      lineCost,
      input.description ?? null,
      actor?.id ?? "system",
      ts,
      version,
      ts
    );

    db.prepare(
      `UPDATE h2r_timesheet
       SET total_hours = total_hours + ?,
           total_cost = total_cost + ?,
           line_count = line_count + 1,
           version = version + 1,
           updated_at = ?
       WHERE timesheet_id = ?`
    ).run(hours, lineCost, ts, timesheetId);

    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_line_added",
      version: timesheet.version + 1,
      actor,
      payload: {
        timesheetId,
        lineId,
        taskId: input.taskId,
        workDate: input.workDate,
        hours,
        projectId: input.projectId,
        costElement: costElementId,
        description: input.description,
        resourceType,
        resourceId: input.resourceId,
        hourlyRate: effectiveRate,
        lineCost,
      } as unknown as Record<string, unknown>,
    });
  });

  return rowToTimesheetLine(
    db.prepare("SELECT * FROM h2r_timesheet_line WHERE timesheet_line_id = ?").get(lineId) as TimesheetLineRow
  );
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
