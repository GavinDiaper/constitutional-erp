import { Router, Request, Response } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import {
  createTimesheet,
  submitTimesheet,
  approveTimesheet,
  getTimesheetById,
  listTimesheets,
  addTimesheetLine,
  listTimesheetLines,
  listContractorAccruals,
  rejectTimesheet,
  reopenRejectedTimesheet,
} from "../domain/h2r/timesheetService";
import {
  commitTimesheetCsvImport,
  getTimesheetCsvTemplate,
  getTimesheetImportBatch,
  listTimesheetImportBatches,
  previewTimesheetCsvImport
} from "../domain/h2r/timesheetImportService";
import { HttpError } from "../utils/errors";

const router = Router();

const previewImportSchema = z.object({
  organizationId: z.string().min(1),
  sourceFilename: z.string().min(1).max(255).optional(),
  csvText: z.string().min(1).max(2_000_000)
});

function requireImportAuthority(req: Request): void {
  const tier = Number(req.actor?.authorityTier ?? 0);
  if (!Number.isFinite(tier) || tier < 4) {
    throw new HttpError(403, "insufficient_authority", "Timesheet import requires authority tier 4 or higher");
  }
}

function sendError(res: Response, err: unknown): void {
  const status = err instanceof HttpError ? err.status : 500;
  const error = err instanceof Error ? err.message : String(err);
  res.status(status).json({ success: false, error });
}

router.get("/import-template.csv", (_req, res) => {
  res.type("text/csv").attachment("timesheet-template.csv").send(getTimesheetCsvTemplate());
});

router.get("/imports", (req, res) => {
  try {
    requireImportAuthority(req);
    const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : "";
    if (!organizationId) throw new HttpError(400, "invalid_request", "organizationId is required");
    res.json({ success: true, data: listTimesheetImportBatches(organizationId) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/imports/preview", validateBody(previewImportSchema), (req, res) => {
  try {
    requireImportAuthority(req);
    const batch = previewTimesheetCsvImport(req.body, req.actor);
    res.status(201).json({ success: true, data: batch });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/imports/:importBatchId", (req, res) => {
  try {
    requireImportAuthority(req);
    res.json({ success: true, data: getTimesheetImportBatch(req.params.importBatchId) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/imports/:importBatchId/commit", (req, res) => {
  try {
    requireImportAuthority(req);
    const batch = commitTimesheetCsvImport(req.params.importBatchId, req.actor);
    res.json({ success: true, data: batch });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/v1/timesheets
 * Create a new timesheet in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const { organizationId, employeeId, resourceType, resourceId, periodStart, periodEnd } = req.body;

    const timesheet = createTimesheet(
      {
        organizationId,
        employeeId,
        resourceType,
        resourceId,
        periodStart,
        periodEnd,
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: timesheet,
      message: `Timesheet '${timesheet.timesheetId}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(err instanceof HttpError ? err.status : 500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/timesheets/:timesheetId
 * Retrieve a timesheet by ID
 */
router.get("/contractor-accruals", (req: Request, res: Response) => {
  try {
    const timesheetId = typeof req.query.timesheetId === "string" ? req.query.timesheetId : undefined;
    const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ success: true, data: listContractorAccruals({ timesheetId, supplierId, status }) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/:timesheetId", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const timesheet = getTimesheetById(timesheetId);

    if (!timesheet) {
      return res.status(404).json({ success: false, error: "Timesheet not found" });
    }

    res.json({ success: true, data: timesheet });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:timesheetId/lines", (req: Request, res: Response) => {
  try {
    const lines = listTimesheetLines(req.params.timesheetId);
    res.json({ success: true, data: lines, count: lines.length });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

/**
 * GET /api/v1/timesheets
 * List all timesheets for an organization
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: "organizationId is required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const timesheets = listTimesheets(organizationId as string, limit, offset);

    res.json({
      success: true,
      data: timesheets,
      limit,
      offset,
      count: timesheets.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/import-template.csv", (req: Request, res: Response) => {
  try {
    requireImportAuthority(req);
    res.type("text/csv").attachment("timesheet-template.csv").send(getTimesheetCsvTemplate());
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/v1/timesheets/:timesheetId/submit
 * Submit timesheet for approval
 */
router.post("/:timesheetId/submit", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const actor = req.actor;

    const timesheet = submitTimesheet(timesheetId, actor);

    res.json({
      success: true,
      data: timesheet,
      message: `Timesheet '${timesheetId}' submitted`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = err instanceof HttpError ? err.status : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/timesheets/:timesheetId/approve
 * Approve timesheet (emits labor posting event)
 */
router.post("/:timesheetId/approve", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const actor = req.actor;

    const timesheet = approveTimesheet(timesheetId, actor);

    res.json({
      success: true,
      data: timesheet,
      message: `Timesheet '${timesheetId}' approved`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = err instanceof HttpError ? err.status : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

router.post("/:timesheetId/reject", (req: Request, res: Response) => {
  try {
    const timesheet = rejectTimesheet(req.params.timesheetId, String(req.body?.reason ?? ""), req.actor);
    res.json({ success: true, data: timesheet });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.post("/:timesheetId/reopen", (req: Request, res: Response) => {
  try {
    const timesheet = reopenRejectedTimesheet(req.params.timesheetId, req.actor);
    res.json({ success: true, data: timesheet });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.post("/:timesheetId/lines", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const { projectId, taskId, resourceId, resourceType, vendorRateId, workDate, hours, costElementId, description, hourlyRate } = req.body ?? {};

    const line = addTimesheetLine(
      timesheetId,
      {
        projectId,
        taskId,
        resourceId,
        resourceType,
        vendorRateId,
        workDate,
        hours,
        costElementId,
        description,
        hourlyRate,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: line });
  } catch (err: unknown) {
    const status = err instanceof Error && "status" in err ? Number((err as any).status) || 500 : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

export default router;
