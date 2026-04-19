import { Router, Request, Response } from "express";
import {
  createProject,
  activateProject,
  holdProject,
  resumeProject,
  completeProject,
  cancelProject,
  getProjectById,
  listProjects,
  getProjectWIPSummary,
  assignBomToProject,
  listProjectBomAssignments,
  postLaborCost,
  listLaborEntries,
  createProjectFinishedItem,
  listProjectFinishedItems,
} from "../domain/proj/projectService";
import { HttpError } from "../utils/errors";

const router = Router();

/**
 * POST /api/v1/projects
 * Create a new project in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const {
      projectId,
      name,
      description,
      projectType,
      customerId,
      contractId,
      wbsId,
      budgetAmount,
      defaultWIPAccountId,
      defaultCloseAccountId,
      startDate,
      endDate,
      projectManagerId,
      organizationId,
    } = req.body;

    const project = createProject(
      {
        projectId,
        name,
        description,
        projectType,
        customerId,
        contractId,
        wbsId,
        budgetAmount,
        defaultWIPAccountId,
        defaultCloseAccountId,
        startDate,
        endDate,
        projectManagerId,
        organizationId,
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: project,
      message: `Project '${project.projectId}' created successfully`,
    });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId
 * Retrieve a project by ID
 */
router.get("/:projectId", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project = getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    res.json({ success: true, data: project });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects
 * List all projects
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const projects = listProjects(limit, offset);

    res.json({
      success: true,
      data: projects,
      limit,
      offset,
      count: projects.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/activate
 * Transition project from Draft → Active
 */
router.post("/:projectId/activate", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const actor = req.actor;

    const project = activateProject(projectId, actor);

    res.json({
      success: true,
      data: project,
      message: `Project '${projectId}' activated`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      error.message.includes("insufficient_authority") ||
      error.message.includes("Insufficient authority")
        ? 403
        : error.message.includes("invalid_state")
        ? 400
        : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/hold
 * Transition project from Active → OnHold
 */
router.post("/:projectId/hold", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { holdReason } = req.body;
    const actor = req.actor;

    const project = holdProject(projectId, holdReason, actor);

    res.json({
      success: true,
      data: project,
      message: `Project '${projectId}' placed on hold`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      error.message.includes("insufficient_authority") ||
      error.message.includes("Insufficient authority")
        ? 403
        : error.message.includes("invalid_state")
        ? 400
        : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/resume
 * Transition project from OnHold → Active
 */
router.post("/:projectId/resume", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const actor = req.actor;

    const project = resumeProject(projectId, actor);

    res.json({
      success: true,
      data: project,
      message: `Project '${projectId}' resumed`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      error.message.includes("insufficient_authority") ||
      error.message.includes("Insufficient authority")
        ? 403
        : error.message.includes("invalid_state")
        ? 400
        : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/complete
 * Transition project to Completed
 * Body: { completionType: "FG_Conversion" | "Expense_Close", closeAccountId?: string }
 */
router.post("/:projectId/complete", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { completionType, closeAccountId } = req.body;
    const actor = req.actor;

    if (!completionType) {
      return res
        .status(400)
        .json({ success: false, error: "completionType is required" });
    }

    const project = completeProject(projectId, completionType, closeAccountId, actor);

    res.json({
      success: true,
      data: project,
      message: `Project '${projectId}' completed as '${completionType}'`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      error.message.includes("insufficient_authority") ||
      error.message.includes("Insufficient authority")
        ? 403
        : error.message.includes("invalid_state")
        ? 400
        : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/cancel
 * Transition project to Cancelled
 * Body: { cancellationReason: string, forceCancel?: boolean }
 */
router.post("/:projectId/cancel", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { cancellationReason, forceCancel } = req.body;
    const actor = req.actor;

    if (!cancellationReason) {
      return res
        .status(400)
        .json({ success: false, error: "cancellationReason is required" });
    }

    const project = cancelProject(projectId, cancellationReason, forceCancel, actor);

    res.json({
      success: true,
      data: project,
      message: `Project '${projectId}' cancelled`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      error.message.includes("insufficient_authority") ||
      error.message.includes("Insufficient authority")
        ? 403
        : error.message.includes("invalid_state")
        ? 400
        : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId/wip
 * Retrieve Project WIP summary
 */
router.get("/:projectId/wip", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const wip = getProjectWIPSummary(projectId);

    if (!wip) {
      return res.status(404).json({ success: false, error: "Project WIP not found" });
    }

    res.json({ success: true, data: wip });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/bom-assignments
 * Assign a BOM to an Active project
 */
router.post("/:projectId/bom-assignments", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { bomId, wbsId, quantityPlanned } = req.body;
    const actor = req.actor;

    const assignment = assignBomToProject({ projectId, bomId, wbsId, quantityPlanned }, actor);

    res.status(201).json({
      success: true,
      data: assignment,
      message: `BOM '${bomId}' assigned to project '${projectId}'`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const status = err instanceof HttpError ? err.status : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId/bom-assignments
 * List all BOM assignments for a project
 */
router.get("/:projectId/bom-assignments", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const assignments = listProjectBomAssignments(projectId);
    res.json({ success: true, data: assignments, count: assignments.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/labor-entries
 * Post labour cost to a project
 */
router.post("/:projectId/labor-entries", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { wbsId, resourceId, hours, rate, costElementId } = req.body;
    const entry = postLaborCost({ projectId, wbsId, resourceId, hours, rate, costElementId }, req.actor);
    res.status(201).json({ success: true, data: entry });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId/labor-entries
 * List labour entries for a project
 */
router.get("/:projectId/labor-entries", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const entries = listLaborEntries(projectId);
    res.json({ success: true, data: entries, count: entries.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/projects/:projectId/finished-items
 * Create a finished item from project WIP
 */
router.post("/:projectId/finished-items", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { skuId, organizationId, quantity, unitCost } = req.body;
    const item = createProjectFinishedItem({ projectId, skuId, organizationId, quantity, unitCost }, req.actor);
    res.status(201).json({ success: true, data: item });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId/finished-items
 * List finished items for a project
 */
router.get("/:projectId/finished-items", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const items = listProjectFinishedItems(projectId);
    res.json({ success: true, data: items, count: items.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
