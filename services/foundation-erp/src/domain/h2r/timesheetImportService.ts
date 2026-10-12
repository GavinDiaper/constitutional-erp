import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
import { addTimesheetLine, createTimesheet, resolveTimesheetRate } from "./timesheetService";

const requiredColumns = [
  "resourceType",
  "resourceId",
  "periodStart",
  "periodEnd",
  "projectId",
  "taskId",
  "workDate",
  "hours",
  "costElementId",
  "role",
  "description"
] as const;

type ResourceType = "employee" | "contractor";

type NormalizedTimesheetRow = {
  rowNumber: number;
  resourceType: ResourceType;
  resourceId: string;
  periodStart: string;
  periodEnd: string;
  projectId?: string;
  taskId?: string;
  workDate: string;
  hours: number;
  costElementId: string;
  role?: string;
  description?: string;
  hourlyRate: number;
  vendorRateId?: string;
  lineCost: number;
};

type RowError = { rowNumber: number; field?: string; message: string };

type ParsedRow = Record<string, string>;

function now(): string {
  return new Date().toISOString();
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseCsv(csvText: string): ParsedRow[] {
  try {
    return parse(csvText, {
      bom: true,
      columns: (headers: string[]) => {
        const normalized = headers.map((header) => header.trim());
        const missing = requiredColumns.filter((column) => !normalized.includes(column));
        if (missing.length > 0) {
          throw new HttpError(400, "invalid_csv_template", `CSV is missing required columns: ${missing.join(", ")}`);
        }
        const duplicates = normalized.filter((header, index) => normalized.indexOf(header) !== index);
        if (duplicates.length > 0) {
          throw new HttpError(400, "invalid_csv_template", `CSV contains duplicate columns: ${[...new Set(duplicates)].join(", ")}`);
        }
        const unsupported = normalized.filter((header) =>
          !requiredColumns.includes(header as (typeof requiredColumns)[number]) && header !== ""
        );
        if (unsupported.length > 0) {
          throw new HttpError(400, "invalid_csv_template", `CSV contains unsupported columns: ${unsupported.join(", ")}`);
        }
        return normalized;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false
    }) as ParsedRow[];
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_csv", error instanceof Error ? error.message : "Unable to parse CSV file");
  }
}

function getBatch(importBatchId: string) {
  const row = db.prepare("SELECT * FROM h2r_timesheet_import_batch WHERE import_batch_id = ?")
    .get(importBatchId) as {
      import_batch_id: string;
      organization_id: string;
      source_filename: string;
      content_hash: string;
      status: "Validated" | "Rejected" | "Committed";
      row_count: number;
      valid_row_count: number;
      error_row_count: number;
      normalized_rows_json: string;
      validation_errors_json: string;
      timesheet_ids_json: string;
      imported_by: string;
      created_at: string;
      committed_at: string | null;
    } | undefined;
  if (!row) throw new HttpError(404, "not_found", "Timesheet import batch not found");
  return row;
}

function projectMatchesOrganization(projectId: string, organizationId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM proj_project WHERE project_id = ? AND organization_id = ?")
    .get(projectId, organizationId));
}

function validateTask(row: ParsedRow, projectId: string | undefined, resourceId: string, resourceType: ResourceType): string | undefined {
  const taskId = row.taskId?.trim();
  if (!taskId) return undefined;
  const task = db.prepare("SELECT project_id, assigned_to FROM proj_task WHERE task_id = ?")
    .get(taskId) as { project_id: string; assigned_to: string | null } | undefined;
  if (!task) throw new Error("Task was not found");
  if (!projectId || task.project_id !== projectId) throw new Error("Task does not belong to the selected project");
  const allocation = db.prepare(
    "SELECT 1 FROM proj_task_allocation WHERE task_id = ? AND resource_id = ? AND resource_type = ? LIMIT 1"
  ).get(taskId, resourceId, resourceType);
  if (!allocation && task.assigned_to !== resourceId) throw new Error("Resource is not assigned to the selected task");
  return taskId;
}

function toPreview(batch: ReturnType<typeof getBatch>) {
  return {
    importBatchId: batch.import_batch_id,
    organizationId: batch.organization_id,
    sourceFilename: batch.source_filename,
    status: batch.status,
    rowCount: batch.row_count,
    validRowCount: batch.valid_row_count,
    errorRowCount: batch.error_row_count,
    rows: JSON.parse(batch.normalized_rows_json) as NormalizedTimesheetRow[],
    errors: JSON.parse(batch.validation_errors_json) as RowError[],
    timesheetIds: JSON.parse(batch.timesheet_ids_json) as string[],
    createdAt: batch.created_at,
    committedAt: batch.committed_at ?? undefined
  };
}

export function getTimesheetCsvTemplate(): string {
  return requiredColumns.join(",") + "\r\n";
}

export function previewTimesheetCsvImport(input: {
  organizationId: string;
  sourceFilename: string;
  csvText: string;
}, actor?: EventActor) {
  if (!db.prepare("SELECT 1 FROM inv_organization WHERE organization_id = ?").get(input.organizationId)) {
    throw new HttpError(404, "not_found", "Organization not found");
  }
  if (!input.csvText.trim()) throw new HttpError(400, "invalid_csv", "CSV file is empty");
  const rows = parseCsv(input.csvText);
  if (rows.length === 0) throw new HttpError(400, "invalid_csv", "CSV file contains no time-entry rows");

  const contentHash = createHash("sha256").update(input.csvText).digest("hex");
  const existing = db.prepare(
    "SELECT * FROM h2r_timesheet_import_batch WHERE organization_id = ? AND content_hash = ?"
  ).get(input.organizationId, contentHash) as { import_batch_id: string } | undefined;
  if (existing) return toPreview(getBatch(existing.import_batch_id));

  const errors: RowError[] = [];
  const normalized: NormalizedTimesheetRow[] = [];
  const fingerprints = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    try {
      const resourceType = row.resourceType?.trim() as ResourceType;
      const resourceId = row.resourceId?.trim();
      const periodStart = row.periodStart?.trim();
      const periodEnd = row.periodEnd?.trim();
      const workDate = row.workDate?.trim();
      const projectId = row.projectId?.trim() || undefined;
      const costElementId = row.costElementId?.trim();
      const role = row.role?.trim() || undefined;
      const hours = Number(row.hours);

      if (resourceType !== "employee" && resourceType !== "contractor") throw new Error("resourceType must be employee or contractor");
      if (!resourceId) throw new Error("resourceId is required");
      if (!isIsoDate(periodStart) || !isIsoDate(periodEnd)) throw new Error("periodStart and periodEnd must use YYYY-MM-DD dates");
      if (periodStart > periodEnd) throw new Error("periodStart must not follow periodEnd");
      if (!isIsoDate(workDate) || workDate < periodStart || workDate > periodEnd) throw new Error("workDate must be a valid date within the timesheet period");
      if (!Number.isFinite(hours) || hours <= 0) throw new Error("hours must be a positive number");
      if (!costElementId) throw new Error("costElementId is required");
      if (!db.prepare("SELECT 1 FROM r2r_cost_element WHERE cost_element_id = ? AND organization_id = ? AND is_active = 1")
        .get(costElementId, input.organizationId)) throw new Error("Active cost element was not found for this organization");

      if (resourceType === "employee") {
        const employee = db.prepare("SELECT 1 FROM h2r_employee WHERE employee_id = ?")
          .get(resourceId);
        if (!employee) throw new Error("Employee was not found");
      }
      if (resourceType === "contractor" && !role) throw new Error("role is required for contractor entries");

      if (projectId && !projectMatchesOrganization(projectId, input.organizationId)) {
        throw new Error("Project was not found in the selected organization");
      }
      const taskId = validateTask(row, projectId, resourceId, resourceType);
      const resolvedRate = resolveTimesheetRate({
        organizationId: input.organizationId,
        resourceId,
        resourceType,
        costElementId,
        workDate,
        role
      });
      const fingerprint = [resourceType, resourceId, projectId ?? "", taskId ?? "", workDate, hours, costElementId, row.description?.trim() ?? ""].join("\u001f");
      if (fingerprints.has(fingerprint)) throw new Error("Duplicate time-entry row in this file");
      fingerprints.add(fingerprint);

      normalized.push({
        rowNumber,
        resourceType,
        resourceId,
        periodStart,
        periodEnd,
        projectId,
        taskId,
        workDate,
        hours,
        costElementId,
        role,
        description: row.description?.trim() || undefined,
        hourlyRate: resolvedRate.hourlyRate,
        vendorRateId: resolvedRate.vendorRateId,
        lineCost: Math.round((hours * resolvedRate.hourlyRate + Number.EPSILON) * 100) / 100
      });
    } catch (error) {
      errors.push({ rowNumber, message: error instanceof Error ? error.message : "Invalid row" });
    }
  });

  const batchId = newId("TSIMP-");
  const timestamp = now();
  const status = errors.length === 0 ? "Validated" : "Rejected";
  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_timesheet_import_batch(
         import_batch_id, organization_id, source_filename, content_hash, status,
         row_count, valid_row_count, error_row_count, normalized_rows_json,
         validation_errors_json, timesheet_ids_json, imported_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`
    ).run(
      batchId,
      input.organizationId,
      input.sourceFilename || "timesheet.csv",
      contentHash,
      status,
      rows.length,
      normalized.length,
      errors.length,
      JSON.stringify(normalized),
      JSON.stringify(errors),
      actor?.id ?? "system",
      timestamp
    );
    appendEvent({
      entityId: batchId,
      entityType: "TimesheetImportBatch",
      eventType: "h2r.timesheet_import_validated",
      version: 1,
      actor,
      payload: {
        organizationId: input.organizationId,
        rowCount: rows.length,
        validRowCount: normalized.length,
        errorRowCount: errors.length,
        status
      }
    });
  });
  return toPreview(getBatch(batchId));
}

export function commitTimesheetCsvImport(importBatchId: string, actor?: EventActor) {
  const batch = getBatch(importBatchId);
  if (batch.status === "Committed") return toPreview(batch);
  if (batch.status !== "Validated" || batch.error_row_count > 0) {
    throw new HttpError(409, "import_not_validated", "Only a fully valid preview can be committed");
  }
  const rows = JSON.parse(batch.normalized_rows_json) as NormalizedTimesheetRow[];
  const groups = new Map<string, NormalizedTimesheetRow[]>();
  for (const row of rows) {
    const key = [row.resourceType, row.resourceId, row.periodStart, row.periodEnd].join("\u001f");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const timesheetIds: string[] = [];
  const timestamp = now();
  transaction(() => {
    const latest = getBatch(importBatchId);
    if (latest.status === "Committed") {
      timesheetIds.push(...JSON.parse(latest.timesheet_ids_json) as string[]);
      return;
    }
    if (latest.status !== "Validated") throw new HttpError(409, "import_not_validated", "Import batch is no longer valid");

    for (const entries of groups.values()) {
      const first = entries[0];
      const timesheet = createTimesheet({
        organizationId: batch.organization_id,
        resourceType: first.resourceType,
        resourceId: first.resourceId,
        employeeId: first.resourceType === "employee" ? first.resourceId : undefined,
        periodStart: first.periodStart,
        periodEnd: first.periodEnd
      }, actor);
      timesheetIds.push(timesheet.timesheetId);
      for (const entry of entries) {
        addTimesheetLine(timesheet.timesheetId, {
          projectId: entry.projectId,
          taskId: entry.taskId,
          resourceId: entry.resourceId,
          resourceType: entry.resourceType,
          vendorRateId: entry.vendorRateId,
          workDate: entry.workDate,
          hours: entry.hours,
          costElementId: entry.costElementId,
          description: entry.description,
          hourlyRate: entry.hourlyRate,
          hourlyRateSource: "LookupCard"
        }, actor);
      }
    }

    db.prepare(
      "UPDATE h2r_timesheet_import_batch SET status = 'Committed', timesheet_ids_json = ?, committed_at = ? WHERE import_batch_id = ?"
    ).run(JSON.stringify(timesheetIds), timestamp, importBatchId);
    appendEvent({
      entityId: importBatchId,
      entityType: "TimesheetImportBatch",
      eventType: "h2r.timesheet_import_committed",
      version: 2,
      actor,
      payload: { timesheetIds, timesheetCount: timesheetIds.length }
    });
  });
  return toPreview(getBatch(importBatchId));
}

export function listTimesheetImportBatches(organizationId: string, limit = 100) {
  return db.prepare(
    `SELECT import_batch_id AS importBatchId, organization_id AS organizationId,
            source_filename AS sourceFilename, status, row_count AS rowCount,
            valid_row_count AS validRowCount, error_row_count AS errorRowCount,
            timesheet_ids_json AS timesheetIdsJson, imported_by AS importedBy,
            created_at AS createdAt, committed_at AS committedAt
     FROM h2r_timesheet_import_batch WHERE organization_id = ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(organizationId, Math.min(Math.max(limit, 1), 200));
}

export function getTimesheetImportBatch(importBatchId: string) {
  return toPreview(getBatch(importBatchId));
}

export const timesheetCsvTemplateColumns = [...requiredColumns];
