import { Router, Request, Response } from "express";
import {
  createTimesheet,
  addTimesheetLine,
  submitTimesheet,
  approveTimesheet,
  getTimesheetById,
  listTimesheets,
  listTimesheetLines,
} from "../domain/h2r/timesheetService";
import { HttpError } from "../utils/errors";

const router = Router();

/**
 * POST /api/v1/timesheets
 * Create a new timesheet in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const { organizationId, employeeId, periodStart, periodEnd } = req.body;

    const timesheet = createTimesheet(
      {
        organizationId,
        employeeId,
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
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/timesheets/:timesheetId
 * Retrieve a timesheet by ID
 */
router.get("/:timesheetId", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const timesheet = getTimesheetById(timesheetId);

    if (!timesheet) {
      return res.status(404).json({ success: false, error: "Timesheet not found" });
    }

    res.json({ success: true, data: timesheet });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
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
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/timesheets/:timesheetId/lines
 * Add a line to a draft timesheet
 */
router.post("/:timesheetId/lines", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const { projectId, costElementId, workDate, hours, hourlyRate, description, laborRateFrom } = req.body;
    const timesheet = addTimesheetLine(
      { timesheetId, projectId, costElementId, workDate, hours, hourlyRate, description, laborRateFrom },
      req.actor
    );

    res.status(201).json({
      success: true,
      data: timesheet,
      message: `Line added to timesheet '${timesheetId}'`,
    });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/timesheets/:timesheetId/lines
 * List line items for a timesheet
 */
router.get("/:timesheetId/lines", (req: Request, res: Response) => {
  try {
    const { timesheetId } = req.params;
    const lines = listTimesheetLines(timesheetId);
    res.json({ success: true, data: lines, count: lines.length });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
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
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/timesheets/:timesheetId/approve
 * Approve and process a timesheet
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
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

export default router;
