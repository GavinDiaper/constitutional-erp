import { Router, Request, Response } from "express";
import {
  createTimesheet,
  submitTimesheet,
  approveTimesheet,
  getTimesheetById,
  listTimesheets,
  addTimesheetLine,
} from "../domain/h2r/timesheetService";

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
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
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
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
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
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
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
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
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
