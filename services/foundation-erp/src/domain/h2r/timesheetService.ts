/**
 * Timesheet Service - H2R Labor Cost aggregate
 * Handles timesheet creation, line addition, approval workflow
 */

import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
import { postLaborCost } from "../proj/projectService";

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
  employee_id: string | null;
  resource_type: "employee" | "contractor";
  resource_id: string;
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
  rejection_reason: string | null;
  line_count: number;
  created_by: string;
  created_at: string;
  version: number;
}

interface VendorRateRow {
  vendor_rate_id: string;
  contractor_id: string;
  supplier_id: string | null;
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
  supplierId?: string;
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
  employeeId?: string;
  resourceType: "employee" | "contractor";
  resourceId: string;
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
  rejectionReason?: string;
  lineCount: number;
  createdBy: string;
  createdAt: string;
  version: number;
}

function rowToVendorRate(row: VendorRateRow): VendorRateProjection {
  return {
    vendorRateId: row.vendor_rate_id,
    contractorId: row.contractor_id,
    supplierId: row.supplier_id ?? undefined,
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
    supplierId?: string;
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
  if (input.supplierId && !db.prepare("SELECT supplier_id FROM p2p_supplier WHERE supplier_id = ?").get(input.supplierId)) {
    throw new HttpError(404, "not_found", "Supplier not found");
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
        vendor_rate_id, contractor_id, supplier_id, vendor_name, role, hourly_rate, currency,
        effective_from, effective_until, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      vendorRateId,
      input.contractorId,
      input.supplierId ?? null,
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

export interface EmployeeCostRateProjection {
  employeeCostRateId: string;
  organizationId: string;
  employeeId: string;
  costElementId: string;
  currency: string;
  hourlyRate: number;
  effectiveFrom: string;
  effectiveUntil?: string;
  status: "Active" | "Inactive";
  approvedBy: string;
  approvedAt: string;
}

export function listEmployeeCostRates(filters: { organizationId?: string; employeeId?: string } = {}): EmployeeCostRateProjection[] {
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.organizationId) {
    conditions.push("organization_id = ?");
    values.push(filters.organizationId);
  }
  if (filters.employeeId) {
    conditions.push("employee_id = ?");
    values.push(filters.employeeId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM h2r_employee_cost_rate ${where} ORDER BY effective_from DESC LIMIT 500`
  ).all(...values) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    employeeCostRateId: String(row.employee_cost_rate_id),
    organizationId: String(row.organization_id),
    employeeId: String(row.employee_id),
    costElementId: String(row.cost_element_id),
    currency: String(row.currency),
    hourlyRate: Number(row.hourly_rate),
    effectiveFrom: String(row.effective_from),
    effectiveUntil: row.effective_until ? String(row.effective_until) : undefined,
    status: row.status as "Active" | "Inactive",
    approvedBy: String(row.approved_by),
    approvedAt: String(row.approved_at)
  }));
}

export function createEmployeeCostRate(input: {
  organizationId: string;
  employeeId: string;
  costElementId: string;
  currency?: string;
  hourlyRate: number;
  effectiveFrom: string;
  effectiveUntil?: string;
}, actor?: EventActor): EmployeeCostRateProjection {
  const rate = Number(input.hourlyRate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new HttpError(400, "invalid_request", "hourlyRate must be a non-negative number");
  }
  if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
    throw new HttpError(400, "invalid_request", "effectiveUntil must not precede effectiveFrom");
  }
  if (!db.prepare("SELECT employee_id FROM h2r_employee WHERE employee_id = ?").get(input.employeeId)) {
    throw new HttpError(404, "not_found", "Employee not found");
  }
  if (!db.prepare("SELECT organization_id FROM inv_organization WHERE organization_id = ?").get(input.organizationId)) {
    throw new HttpError(404, "not_found", "Organization not found");
  }
  if (!db.prepare("SELECT cost_element_id FROM r2r_cost_element WHERE cost_element_id = ?").get(input.costElementId)) {
    throw new HttpError(404, "not_found", "Cost element not found");
  }

  const employeeCostRateId = newId("ECR-");
  const timestamp = now();
  const actorId = actor?.id ?? "system";
  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_employee_cost_rate(
         employee_cost_rate_id, organization_id, employee_id, cost_element_id, currency, hourly_rate,
         effective_from, effective_until, status, approved_by, approved_at, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?)`
    ).run(
      employeeCostRateId,
      input.organizationId,
      input.employeeId,
      input.costElementId,
      input.currency ?? "USD",
      rate,
      input.effectiveFrom,
      input.effectiveUntil ?? null,
      actorId,
      timestamp,
      actorId,
      timestamp,
      timestamp
    );
    appendEvent({
      entityId: employeeCostRateId,
      entityType: "EmployeeCostRate",
      eventType: "h2r.employee_cost_rate_created",
      version: 1,
      actor,
      payload: {
        employeeCostRateId,
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        costElementId: input.costElementId,
        hourlyRate: rate,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil ?? null
      }
    });
  });
  return listEmployeeCostRates({ employeeId: input.employeeId, organizationId: input.organizationId })
    .find((row) => row.employeeCostRateId === employeeCostRateId)!;
}

export function resolveTimesheetRate(input: {
  organizationId: string;
  resourceId: string;
  resourceType: "employee" | "contractor";
  costElementId: string;
  workDate: string;
  role?: string;
}): { hourlyRate: number; vendorRateId?: string; supplierId?: string; rateSource: "EmployeeRate" | "VendorRate" } {
  if (input.resourceType === "employee") {
    const rows = db.prepare(
      `SELECT employee_cost_rate_id, hourly_rate, effective_from
       FROM h2r_employee_cost_rate
       WHERE organization_id = ? AND employee_id = ? AND cost_element_id = ? AND status = 'Active'
         AND date(effective_from) <= date(?) AND (effective_until IS NULL OR date(effective_until) >= date(?))
       ORDER BY date(effective_from) DESC, created_at DESC LIMIT 2`
    ).all(input.organizationId, input.resourceId, input.costElementId, input.workDate, input.workDate) as Array<{
      employee_cost_rate_id: string;
      hourly_rate: number;
      effective_from: string;
    }>;
    if (rows.length === 0) {
      throw new HttpError(400, "employee_rate_missing", `No approved employee cost rate for '${input.resourceId}' on ${input.workDate}`);
    }
    if (rows.length > 1 && rows[0].effective_from === rows[1].effective_from && rows[0].hourly_rate !== rows[1].hourly_rate) {
      throw new HttpError(409, "employee_rate_ambiguous", `Multiple employee cost rates match '${input.resourceId}' on ${input.workDate}`);
    }
    return { hourlyRate: Number(rows[0].hourly_rate), rateSource: "EmployeeRate" };
  }

  const rows = db.prepare(
    `SELECT vendor_rate_id, supplier_id, hourly_rate, role
     FROM h2r_vendor_rate
     WHERE contractor_id = ? AND status = 'Active'
       AND date(effective_from) <= date(?) AND (effective_until IS NULL OR date(effective_until) >= date(?))
       AND (? IS NULL OR LOWER(role) = LOWER(?))
     ORDER BY date(effective_from) DESC LIMIT 2`
  ).all(input.resourceId, input.workDate, input.workDate, input.role ?? null, input.role ?? null) as Array<{
    vendor_rate_id: string;
    supplier_id: string | null;
    hourly_rate: number;
    role: string;
  }>;
  if (rows.length === 0) {
    throw new HttpError(400, "vendor_rate_missing", `No active contractor rate for '${input.resourceId}' on ${input.workDate}`);
  }
  if (rows.length > 1 && rows[0].role.toLowerCase() === rows[1].role.toLowerCase()) {
    throw new HttpError(409, "vendor_rate_ambiguous", `Multiple contractor rates match '${input.resourceId}' on ${input.workDate}`);
  }
  return {
    hourlyRate: Number(rows[0].hourly_rate),
    vendorRateId: rows[0].vendor_rate_id,
    supplierId: rows[0].supplier_id ?? undefined,
    rateSource: "VendorRate"
  };
}

export function createTimesheet(
  input: {
    organizationId: string;
    employeeId?: string;
    resourceType?: "employee" | "contractor";
    resourceId?: string;
    periodStart: string;
    periodEnd: string;
  },
  actor?: EventActor
): TimesheetProjection {
  const resourceType = input.resourceType ?? "employee";
  const resourceId = input.resourceId ?? input.employeeId;
  if (!resourceId) {
    throw new HttpError(400, "invalid_request", "resourceId or employeeId is required");
  }
  if (resourceType === "employee" && input.employeeId && input.employeeId !== resourceId) {
    throw new HttpError(400, "invalid_request", "employeeId must match resourceId for employee timesheets");
  }
  if (resourceType === "contractor" && input.employeeId) {
    throw new HttpError(400, "invalid_request", "Contractor timesheets cannot specify employeeId");
  }
  const timesheetId = newId("TS-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO h2r_timesheet(
          timesheet_id, organization_id, employee_id, resource_type, resource_id,
          timesheet_period_start, timesheet_period_end,
          timesheet_period_year, timesheet_period_month,
          total_hours, total_cost,
          status, approval_status,
          line_count, created_by, created_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        timesheetId,
        input.organizationId,
        resourceType === "employee" ? resourceId : null,
        resourceType,
        resourceId,
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
          resourceType,
          resourceId,
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
    hourlyRateSource?: "EmployeeOverride" | "RoleDefault" | "LookupCard";
  },
  actor?: EventActor
): TimesheetLineProjection {
  const timesheet = getTimesheetById(timesheetId);
  if (!timesheet) {
    throw new HttpError(404, "not_found", "Timesheet not found");
  }
  if (timesheet.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "Cannot add timesheet lines after submission");
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
  const laborRateSource = input.hourlyRateSource ?? (vendorRate ? "LookupCard" : "EmployeeOverride");

  const version = 1;

  transaction(() => {
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

export function listTimesheetLines(timesheetId: string): TimesheetLineProjection[] {
  if (!getTimesheetById(timesheetId)) throw new HttpError(404, "not_found", "Timesheet not found");
  const rows = db.prepare(
    "SELECT * FROM h2r_timesheet_line WHERE timesheet_id = ? ORDER BY line_number ASC"
  ).all(timesheetId) as TimesheetLineRow[];
  return rows.map(rowToTimesheetLine);
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

  const projectLines = db.prepare(
        `SELECT l.timesheet_line_id, l.project_id, l.task_id, l.resource_id, l.resource_type,
          l.vendor_rate_id, l.hours, l.hourly_rate, l.cost_element_id,
          l.project_labor_entry_id, p.wbs_id
     FROM h2r_timesheet_line l
     LEFT JOIN proj_project p ON p.project_id = l.project_id
     WHERE l.timesheet_id = ? AND l.project_id IS NOT NULL
     ORDER BY l.line_number ASC`
  ).all(timesheetId) as Array<{
    timesheet_line_id: string;
    project_id: string;
    task_id: string | null;
    resource_id: string | null;
    resource_type: "employee" | "contractor" | null;
    vendor_rate_id: string | null;
    hours: number;
    hourly_rate: number;
    cost_element_id: string;
    project_labor_entry_id: string | null;
    wbs_id: string | null;
  }>;
  for (const line of projectLines) {
    if (line.project_labor_entry_id) continue;
    if (!line.resource_id) {
      throw new HttpError(409, "timesheet_resource_missing", `Timesheet line '${line.timesheet_line_id}' has no resource ID`);
    }
    postLaborCost({
      projectId: line.project_id,
      wbsId: line.wbs_id ?? undefined,
      resourceId: line.resource_id,
      hours: line.hours,
      rate: line.hourly_rate,
      costElementId: line.cost_element_id,
      taskId: line.task_id ?? undefined,
      sourceTimesheetLineId: line.timesheet_line_id,
      resourceType: line.resource_type ?? "employee",
      vendorRateId: line.vendor_rate_id ?? undefined
    }, actor);
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

export function rejectTimesheet(timesheetId: string, reason: string, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetById(timesheetId);
  if (!timesheet) throw new HttpError(404, "not_found", "Timesheet not found");
  if (timesheet.status !== "Submitted") throw new HttpError(400, "invalid_state", "Timesheet must be Submitted to reject");
  const rejectionReason = reason.trim();
  if (!rejectionReason) throw new HttpError(400, "invalid_request", "rejection reason is required");
  const timestamp = now();
  transaction(() => {
    db.prepare(
      `UPDATE h2r_timesheet SET status = 'Rejected', approval_status = 'Rejected', rejection_reason = ?,
       version = version + 1, updated_at = ? WHERE timesheet_id = ?`
    ).run(rejectionReason, timestamp, timesheetId);
    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_rejected",
      version: timesheet.version + 1,
      actor,
      payload: { timesheetId, rejectionReason }
    });
  });
  return getTimesheetById(timesheetId) as TimesheetProjection;
}

export function reopenRejectedTimesheet(timesheetId: string, actor?: EventActor): TimesheetProjection {
  const timesheet = getTimesheetById(timesheetId);
  if (!timesheet) throw new HttpError(404, "not_found", "Timesheet not found");
  if (timesheet.status !== "Rejected") throw new HttpError(400, "invalid_state", "Only a Rejected timesheet can be reopened");
  const timestamp = now();
  transaction(() => {
    db.prepare(
      `UPDATE h2r_timesheet SET status = 'Draft', approval_status = 'Pending', rejection_reason = NULL,
       submitted_by = NULL, submitted_at = NULL, version = version + 1, updated_at = ? WHERE timesheet_id = ?`
    ).run(timestamp, timesheetId);
    appendEvent({
      entityId: timesheetId,
      entityType: "timesheet",
      eventType: "h2r.timesheet_reopened",
      version: timesheet.version + 1,
      actor,
      payload: { timesheetId }
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
    employeeId: row.employee_id ?? undefined,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
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
    rejectionReason: row.rejection_reason ?? undefined,
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
    employeeId: row.employee_id ?? undefined,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
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
    rejectionReason: row.rejection_reason ?? undefined,
    lineCount: row.line_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  }));
}

export function listContractorAccruals(filters: { timesheetId?: string; supplierId?: string; status?: string } = {}) {
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.timesheetId) {
    conditions.push("l.timesheet_id = ?");
    values.push(filters.timesheetId);
  }
  if (filters.supplierId) {
    conditions.push("a.supplier_id = ?");
    values.push(filters.supplierId);
  }
  if (filters.status) {
    conditions.push("a.status = ?");
    values.push(filters.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(
        `SELECT a.accrual_id AS accrualId, a.timesheet_line_id AS timesheetLineId,
            l.timesheet_id AS timesheetId, a.labor_entry_id AS laborEntryId,
            a.contractor_id AS contractorId, a.vendor_rate_id AS vendorRateId,
            a.supplier_id AS supplierId, a.project_id AS projectId,
            a.currency, a.amount, a.amount AS accruedAmount,
          COALESCE((SELECT SUM(m.matched_amount)
              FROM p2p_supplier_invoice_timesheet_accrual m
              JOIN p2p_supplier_invoice si ON si.supplier_invoice_id = m.supplier_invoice_id
              WHERE m.accrual_id = a.accrual_id AND si.state <> 'Cancelled'), 0) AS matchedAmount,
          MAX(0, a.amount - COALESCE((SELECT SUM(m.matched_amount)
                   FROM p2p_supplier_invoice_timesheet_accrual m
                   JOIN p2p_supplier_invoice si ON si.supplier_invoice_id = m.supplier_invoice_id
                   WHERE m.accrual_id = a.accrual_id AND si.state <> 'Cancelled'), 0)) AS availableAmount,
          a.status, a.gl_journal_id AS glJournalId,
            a.supplier_invoice_id AS supplierInvoiceId, a.created_at AS createdAt,
            a.updated_at AS updatedAt
     FROM h2r_contractor_accrual a
     JOIN h2r_timesheet_line l ON l.timesheet_line_id = a.timesheet_line_id
     ${where}
     ORDER BY a.created_at ASC`
  ).all(...values);
}
