import { Router, Request, Response } from "express";
import { db } from "../db/connection";
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
  createProjectServiceBomRequirement,
  listProjectServiceBomRequirements,
  createProjectTask,
  listProjectTasks,
  createTaskAllocation,
  logTaskHours,
  postLaborCost,
  listLaborEntries,
  getProjectProgressSummary,
  getProjectFinancialSummary,
  getProjectProfitabilitySummary,
  createProjectRisk,
  upsertProjectStageGate,
  advanceProjectPhase,
  createProjectMilestone,
  approveProjectMilestone,
  createProjectChangeRequest,
  approveProjectChangeRequest,
  createProjectFinishedItem,
  listProjectFinishedItems,
  listProjectRequisitions,
  listProjectPurchaseOrders,
  listProjectSalesOrders,
  getProjectProcurementPreview,
  generateProjectRequisitionLinesFromPreview,
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
 * GET /api/v1/projects/:projectId/progress
 * Aggregate task-level completion into a project-level progress summary
 */
router.get("/:projectId/progress", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const progress = getProjectProgressSummary(projectId);

    if (!progress) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    res.json({ success: true, data: progress });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId/financial-summary
 * Cost-to-cost project completion and profitability summary for service work
 */
router.get("/:projectId/financial-summary", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const summary = getProjectFinancialSummary(projectId);

    if (!summary) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    res.json({ success: true, data: summary });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/projects/:projectId/profitability
 * WIP/deferred revenue and profitability view for service projects
 */
router.get("/:projectId/profitability", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const summary = getProjectProfitabilitySummary(projectId);

    if (!summary) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    res.json({ success: true, data: summary });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/risks", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title, probabilityPercent, impactAmount } = req.body ?? {};

    const risk = createProjectRisk(
      projectId,
      {
        title,
        probabilityPercent,
        impactAmount,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: risk });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/change-requests", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title, description, deltaBudgetAmount } = req.body ?? {};

    const changeRequest = createProjectChangeRequest(
      projectId,
      {
        title,
        description,
        deltaBudgetAmount,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: changeRequest });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/change-requests/:changeRequestId/approve", (req: Request, res: Response) => {
  try {
    const { projectId, changeRequestId } = req.params;
    const changeRequest = approveProjectChangeRequest(projectId, changeRequestId, req.actor);
    res.json({ success: true, data: changeRequest });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/stage-gates", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { phaseName, requiredSignoffs, approvals } = req.body ?? {};

    const existing = db
      .prepare("SELECT * FROM proj_stage_gate WHERE project_id = ? AND phase_name = ?")
      .get(projectId, phaseName) as { gate_id: string } | undefined;

    const gate = upsertProjectStageGate(
      projectId,
      {
        phaseName,
        requiredSignoffs: Array.isArray(requiredSignoffs) ? requiredSignoffs : [],
        approvals: Array.isArray(approvals) ? approvals : [],
      },
      req.actor
    );

    res.status(existing ? 200 : 201).json({ success: true, data: gate });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/advance-phase", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { phaseName } = req.body ?? {};

    const gate = advanceProjectPhase(projectId, phaseName, req.actor);
    res.json({ success: true, data: gate });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/milestones", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, phaseName, billingAmount } = req.body ?? {};

    const milestone = createProjectMilestone(
      projectId,
      {
        name,
        phaseName,
        billingAmount,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: milestone });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/milestones/:milestoneId/approve", (req: Request, res: Response) => {
  try {
    const { projectId, milestoneId } = req.params;
    const milestone = approveProjectMilestone(projectId, milestoneId, req.actor);
    res.json({ success: true, data: milestone });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
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

router.post("/:projectId/service-bom-requirements", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { wbsId, role, estimatedHours, requiredSkill, requiredCertification, status } = req.body ?? {};

    const requirement = createProjectServiceBomRequirement(
      projectId,
      {
        wbsId,
        role,
        estimatedHours,
        requiredSkill,
        requiredCertification,
        status,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: requirement });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.get("/:projectId/service-bom-requirements", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const requirements = listProjectServiceBomRequirements(projectId);
    res.json({ success: true, data: requirements, count: requirements.length });
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
 * POST /api/v1/projects/:projectId/tasks
 * Create a project task with estimated and remaining hours
 */
router.post("/:projectId/tasks", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, description, assignedTo, requiredSkill, estimatedHours, remainingHours, status } = req.body ?? {};

    const task = createProjectTask(
      projectId,
      {
        name,
        description,
        assignedTo,
        requiredSkill,
        estimatedHours,
        remainingHours,
        status,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: task });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.get("/:projectId/tasks", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const tasks = listProjectTasks(projectId);
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/tasks/:taskId/allocations", (req: Request, res: Response) => {
  try {
    const { projectId, taskId } = req.params;
    const { resourceId, resourceType, role, allocatedHours, skillRequired, workDate } = req.body ?? {};

    const allocation = createTaskAllocation(
      projectId,
      taskId,
      {
        resourceId,
        resourceType,
        role,
        allocatedHours,
        skillRequired,
        workDate,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: allocation });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/tasks/:taskId/log-hours", (req: Request, res: Response) => {
  try {
    const { projectId, taskId } = req.params;
    const { hours, resourceId, rate, costElementId } = req.body ?? {};

    const result = logTaskHours(
      projectId,
      taskId,
      {
        hours,
        resourceId,
        rate,
        costElementId,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
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

router.get("/:projectId/requisitions", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const requisitions = listProjectRequisitions(projectId);

    res.json({ success: true, data: requisitions, count: requisitions.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:projectId/purchase-orders", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const purchaseOrders = listProjectPurchaseOrders(projectId);

    res.json({ success: true, data: purchaseOrders, count: purchaseOrders.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:projectId/sales-orders", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const salesOrders = listProjectSalesOrders(projectId);

    res.json({ success: true, data: salesOrders, count: salesOrders.length });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:projectId/procurement-preview", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const preview = getProjectProcurementPreview(projectId);
    res.json({ success: true, data: preview });
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500;
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:projectId/generate-requisition-lines", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      requisitionId,
      requester,
      department,
      currencyCode,
      neededByDate,
      legalEntityId,
    } = req.body ?? {};

    const result = generateProjectRequisitionLinesFromPreview(
      projectId,
      {
        requisitionId,
        requester,
        department,
        currencyCode,
        neededByDate,
        legalEntityId,
      },
      req.actor
    );

    res.status(201).json({ success: true, data: result });
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
