import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
import { postInventoryMovement } from "../inv/inventoryService";
import { addRequisitionLine } from "../p2p/requisition/requisitionLineService";
import { createRequisition, getRequisitionById } from "../p2p/requisition/requisitionService";
import {
  EventPayload_ProjectCreated,
  EventPayload_ProjectActivated,
  EventPayload_ProjectHeld,
  EventPayload_ProjectResumed,
  EventPayload_ProjectCompleted,
  EventPayload_ProjectCancelled,
  EventPayload_WIPCreated,
  ProjectProjection,
  ProjectWIPProjection,
  EventPayload_BomAssigned,
  BomAssignmentProjection,
  EventPayload_LaborCosted,
  LaborEntryProjection,
  EventPayload_FinishedItemCreated,
  FinishedItemProjection,
} from "../../events/schemas/projectsAndTradeEventSchemas";

type ProjectStatus = "Draft" | "Active" | "OnHold" | "Completed" | "Cancelled";

interface ProjectRow {
  project_id: string;
  name: string;
  description: string | null;
  customer_id: string | null;
  contract_id: string | null;
  wbs_id: string | null;
  project_type: "Internal" | "Capital" | "Billable" | "Service";
  status: ProjectStatus;
  budget_amount: number;
  baseline_budget_amount: number;
  actual_cost_amount: number;
  revenue_amount: number | null;
  default_wip_account_id: string;
  default_close_account_id: string;
  start_date: string;
  end_date: string | null;
  project_manager_id: string;
  organization_id: string;
  created_at: string;
  created_by: string;
  version: number;
  last_event_at: string;
  wip_material_balance: number;
  wip_labor_balance: number;
  wip_total_balance: number;
  closed_fg_cost: number | null;
  closed_expense_cost: number | null;
}

interface ProjectWIPRow {
  wip_id: string;
  project_id: string;
  wip_material_balance: number;
  wip_labor_balance: number;
  wip_overhead_balance: number;
  wip_total_balance: number;
  material_line_count: number;
  labor_line_count: number;
  status: "Open" | "Closed";
  closed_at: string | null;
  close_completion_type: "FG_Conversion" | "Expense_Close" | null;
  organization_id: string;
  created_at: string;
  last_material_posted_at: string | null;
  last_labor_posted_at: string | null;
  version: number;
}

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseActorTier(actor?: EventActor): number {
  if (!actor?.authorityTier) {
    return 0;
  }

  const parsed = Number(actor.authorityTier);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireTier(actor: EventActor | undefined, requiredTier: 1 | 2 | 3 | 4 | 5, message: string): void {
  if (parseActorTier(actor) < requiredTier) {
    throw new HttpError(403, "insufficient_authority", message);
  }
}

function getProjectRow(projectId: string): ProjectRow {
  const row = db.prepare("SELECT * FROM proj_project WHERE project_id = ?").get(projectId) as ProjectRow | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Project not found");
  }
  return row;
}

function getProjectWIPRow(wipId: string): ProjectWIPRow {
  const row = db.prepare("SELECT * FROM proj_wip WHERE wip_id = ?").get(wipId) as ProjectWIPRow | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Project WIP not found");
  }
  return row;
}

function getProjectWIPByProjectId(projectId: string): ProjectWIPRow {
  const row = db
    .prepare("SELECT * FROM proj_wip WHERE project_id = ?")
    .get(projectId) as ProjectWIPRow | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Project WIP not found for project");
  }
  return row;
}

function validateProjectInput(input: {
  name: string;
  budgetAmount: number;
  defaultWIPAccountId: string;
  defaultCloseAccountId: string;
  projectManagerId: string;
  projectType?: "Internal" | "Capital" | "Billable" | "Service";
  contractId?: string;
  wbsId?: string;
}): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "name is required and cannot be empty");
  }

  if (!Number.isFinite(input.budgetAmount) || input.budgetAmount < 0) {
    throw new HttpError(400, "invalid_request", "budgetAmount must be a non-negative number");
  }

  if (!input.defaultWIPAccountId || input.defaultWIPAccountId.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "defaultWIPAccountId is required");
  }

  if (!input.defaultCloseAccountId || input.defaultCloseAccountId.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "defaultCloseAccountId is required");
  }

  if (!input.projectManagerId || input.projectManagerId.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "projectManagerId is required");
  }

  if (input.projectType === "Service") {
    if (!input.contractId || input.contractId.trim().length === 0) {
      throw new HttpError(
        400,
        "invalid_request",
        "ERR_PROJECT_SERVICE_NO_CONTRACT: contractId is required for Service projects"
      );
    }

    if (!input.wbsId || input.wbsId.trim().length === 0) {
      throw new HttpError(
        400,
        "invalid_request",
        "ERR_PROJECT_SERVICE_NO_WBS: wbsId is required for Service projects"
      );
    }
  }
}

function resolveAccountId(rawAccountRef: string, label: string): string {
  const row = db
    .prepare("SELECT account_id FROM r2r_account WHERE account_id = ? OR account_code = ?")
    .get(rawAccountRef, rawAccountRef) as { account_id: string } | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", `${label} account not found`);
  }

  return row.account_id;
}

/**
 * createProject
 * Creates a new project in Draft status and associated WIP ledger.
 * Guards: Input validation only; no authority checks for creation.
 * Emits: proj.project_created + proj.wip_created events
 */
export function createProject(
  input: {
    projectId?: string;
    name: string;
    description?: string;
    projectType: "Internal" | "Capital" | "Billable" | "Service";
    customerId?: string;
    contractId?: string;
    wbsId?: string;
    budgetAmount: number;
    defaultWIPAccountId: string;
    defaultCloseAccountId: string;
    startDate: string;
    endDate?: string;
    projectManagerId: string;
    organizationId: string;
  },
  actor?: EventActor
): ProjectProjection {
  validateProjectInput(input);

  const projectId = input.projectId ?? newId("PRJ-");
  const wipId = newId("WIP-");
  const timestamp = now();

  // Verify organization exists (optional guard; can skip if orgs are optional)
  const org = db
    .prepare("SELECT organization_id FROM inv_organization WHERE organization_id = ?")
    .get(input.organizationId) as { organization_id: string } | undefined;
  if (!org) {
    throw new HttpError(404, "not_found", "Organization not found");
  }

  const resolvedWipAccountId = resolveAccountId(input.defaultWIPAccountId, "Default WIP");
  const resolvedCloseAccountId = resolveAccountId(input.defaultCloseAccountId, "Default close");

  try {
    transaction(() => {
      // Insert project row
      db.prepare(
        `INSERT INTO proj_project(
          project_id, name, description, customer_id, contract_id, wbs_id, project_type, status,
          budget_amount, baseline_budget_amount, actual_cost_amount, revenue_amount,
          default_wip_account_id, default_close_account_id,
          start_date, end_date, project_manager_id, organization_id,
          created_at, created_by, version, last_event_at,
          wip_material_balance, wip_labor_balance, wip_total_balance,
          closed_fg_cost, closed_expense_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        projectId,
        input.name,
        input.description ?? null,
        input.customerId ?? null,
        input.contractId ?? null,
        input.wbsId ?? null,
        input.projectType,
        "Draft",
        input.budgetAmount,
        input.budgetAmount,
        0, // actual_cost_amount starts at 0
        null, // revenue_amount
        resolvedWipAccountId,
        resolvedCloseAccountId,
        input.startDate,
        input.endDate ?? null,
        input.projectManagerId,
        input.organizationId,
        timestamp,
        actor?.id ?? "system",
        1, // version
        timestamp,
        0, // wip_material_balance
        0, // wip_labor_balance
        0, // wip_total_balance
        null, // closed_fg_cost
        null // closed_expense_cost
      );

      // Insert WIP ledger
      db.prepare(
        `INSERT INTO proj_wip(
          wip_id, project_id,
          wip_material_balance, wip_labor_balance, wip_overhead_balance,
          material_line_count, labor_line_count,
          status, closed_at, close_completion_type,
          organization_id, created_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        wipId,
        projectId,
        0, // wip_material_balance
        0, // wip_labor_balance
        0, // wip_overhead_balance
        0, // material_line_count
        0, // labor_line_count
        "Open", // status
        null, // closed_at
        null, // close_completion_type
        input.organizationId,
        timestamp,
        1 // version
      );

      // Emit events
      const projectPayload: EventPayload_ProjectCreated = {
        projectId,
        name: input.name,
        description: input.description,
        projectType: input.projectType,
        customerId: input.customerId,
        contractId: input.contractId,
        wbsId: input.wbsId,
        budgetAmount: input.budgetAmount,
        defaultWIPAccountId: resolvedWipAccountId,
        defaultCloseAccountId: resolvedCloseAccountId,
        startDate: input.startDate,
        projectManagerId: input.projectManagerId,
        organizationId: input.organizationId,
      };

      appendEvent({
        entityId: projectId,
        entityType: "project",
        eventType: "proj.project_created",
        version: 1,
        actor,
        payload: projectPayload as unknown as Record<string, unknown>,
      });

      const wipPayload: EventPayload_WIPCreated = {
        wipId,
        projectId,
        organizationId: input.organizationId,
      };

      appendEvent({
        entityId: wipId,
        entityType: "project_wip",
        eventType: "proj.wip_created",
        version: 1,
        actor,
        payload: wipPayload as unknown as Record<string, unknown>,
        causationId: projectId, // WIP creation is caused by project creation
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate", `Project with id '${projectId}' already exists`);
    }
    throw err;
  }

  return getProjectById(projectId) as ProjectProjection;
}

/**
 * activateProject
 * Transitions project from Draft → Active
 * Guards: Project exists, status = Draft, actor tier >= 1
 */
export function activateProject(projectId: string, actor?: EventActor): ProjectProjection {
  requireTier(actor, 1, "Insufficient authority to activate project");

  const project = getProjectRow(projectId);
  if (project.status !== "Draft") {
    throw new HttpError(400, "invalid_state", `Cannot activate project in '${project.status}' status`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE proj_project SET status = ?, version = version + 1, last_event_at = ?
       WHERE project_id = ?`
    ).run("Active", timestamp, projectId);

    const payload: EventPayload_ProjectActivated = {
      projectId,
      activatedAt: timestamp,
    };

    appendEvent({
      entityId: projectId,
      entityType: "project",
      eventType: "proj.project_activated",
      version: project.version + 1,
      actor,
      governance: {
        riskLevel: "Medium",
        requiredTier: 1,
        governanceTag: "project_activate",
      },
      payload: payload as unknown as Record<string, unknown>,
    });
  });

  return getProjectById(projectId) as ProjectProjection;
}

/**
 * holdProject
 * Transitions project from Active → OnHold
 * Guards: Project exists, status = Active, actor tier >= 1
 */
export function holdProject(
  projectId: string,
  holdReason?: string,
  actor?: EventActor
): ProjectProjection {
  requireTier(actor, 1, "Insufficient authority to hold project");

  const project = getProjectRow(projectId);
  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", `Cannot hold project in '${project.status}' status`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE proj_project SET status = ?, version = version + 1, last_event_at = ?
       WHERE project_id = ?`
    ).run("OnHold", timestamp, projectId);

    const payload: EventPayload_ProjectHeld = {
      projectId,
      heldAt: timestamp,
      holdReason,
    };

    appendEvent({
      entityId: projectId,
      entityType: "project",
      eventType: "proj.project_held",
      version: project.version + 1,
      actor,
      governance: {
        riskLevel: "Low",
        requiredTier: 1,
        governanceTag: "project_hold",
      },
      payload: payload as unknown as Record<string, unknown>,
    });
  });

  return getProjectById(projectId) as ProjectProjection;
}

/**
 * resumeProject
 * Transitions project from OnHold → Active
 * Guards: Project exists, status = OnHold, actor tier >= 1
 */
export function resumeProject(projectId: string, actor?: EventActor): ProjectProjection {
  requireTier(actor, 1, "Insufficient authority to resume project");

  const project = getProjectRow(projectId);
  if (project.status !== "OnHold") {
    throw new HttpError(400, "invalid_state", `Cannot resume project in '${project.status}' status`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE proj_project SET status = ?, version = version + 1, last_event_at = ?
       WHERE project_id = ?`
    ).run("Active", timestamp, projectId);

    const payload: EventPayload_ProjectResumed = {
      projectId,
      resumedAt: timestamp,
    };

    appendEvent({
      entityId: projectId,
      entityType: "project",
      eventType: "proj.project_resumed",
      version: project.version + 1,
      actor,
      governance: {
        riskLevel: "Low",
        requiredTier: 1,
        governanceTag: "project_resume",
      },
      payload: payload as unknown as Record<string, unknown>,
    });
  });

  return getProjectById(projectId) as ProjectProjection;
}

/**
 * completeProject
 * Transitions project from Active/OnHold → Completed
 * Guards:
 *   - Project exists, status = Active or OnHold
 *   - completionType = "FG_Conversion" or "Expense_Close"
 *   - actor tier >= 2 (high-risk: finalizes WIP)
 *   - No open required transactions (placeholder; Phase 2 event-processor validates)
 *   - All GL postings reconciled (placeholder)
 */
export function completeProject(
  projectId: string,
  completionType: "FG_Conversion" | "Expense_Close",
  closeAccountId?: string,
  actor?: EventActor
): ProjectProjection {
  requireTier(actor, 2, "Insufficient authority to complete project");

  if (!["FG_Conversion", "Expense_Close"].includes(completionType)) {
    throw new HttpError(
      400,
      "invalid_request",
      "completionType must be 'FG_Conversion' or 'Expense_Close'"
    );
  }

  if (completionType === "Expense_Close" && !closeAccountId) {
    throw new HttpError(
      400,
      "invalid_request",
      "closeAccountId required when completionType is 'Expense_Close'"
    );
  }

  const project = getProjectRow(projectId);
  if (!["Active", "OnHold"].includes(project.status)) {
    throw new HttpError(400, "invalid_state", `Cannot complete project in '${project.status}' status`);
  }

  const wip = getProjectWIPByProjectId(projectId);
  const timestamp = now();

  transaction(() => {
    // Update project
    db.prepare(
      `UPDATE proj_project SET status = ?, end_date = ?, version = version + 1, last_event_at = ?
       WHERE project_id = ?`
    ).run("Completed", timestamp, timestamp, projectId);

    // Update WIP to Closed
    db.prepare(
      `UPDATE proj_wip SET status = ?, closed_at = ?, close_completion_type = ?, version = version + 1
       WHERE wip_id = ?`
    ).run("Closed", timestamp, completionType, wip.wip_id);

    // Emit project completion event
    const projPayload: EventPayload_ProjectCompleted = {
      projectId,
      completionType,
      completedAt: timestamp,
      finalWIPMaterialBalance: wip.wip_material_balance,
      finalWIPLaborBalance: wip.wip_labor_balance,
      finalWIPTotalBalance:
        wip.wip_material_balance + wip.wip_labor_balance + wip.wip_overhead_balance,
      closeAccountId,
    };

    appendEvent({
      entityId: projectId,
      entityType: "project",
      eventType: "proj.project_completed",
      version: project.version + 1,
      actor,
      governance: {
        riskLevel: "High",
        requiredTier: 2,
        governanceTag: "project_complete",
      },
      payload: projPayload as unknown as Record<string, unknown>,
    });

    // Emit WIP closed event (triggered by project completion)
    const wipPayload = {
      wipId: wip.wip_id,
      projectId,
      closureType: completionType,
      finalMaterialBalance: wip.wip_material_balance,
      finalLaborBalance: wip.wip_labor_balance,
      finalTotalBalance:
        wip.wip_material_balance + wip.wip_labor_balance + wip.wip_overhead_balance,
      closedAt: timestamp,
    };

    appendEvent({
      entityId: wip.wip_id,
      entityType: "project_wip",
      eventType: "proj.wip_closed",
      version: wip.version + 1,
      actor,
      governance: {
        riskLevel: "High",
        requiredTier: 2,
        governanceTag: "project_complete",
      },
      payload: wipPayload as unknown as Record<string, unknown>,
      causationId: projectId,
    });
  });

  return getProjectById(projectId) as ProjectProjection;
}

/**
 * cancelProject
 * Transitions project from any state → Cancelled
 * Guards:
 *   - Project exists
 *   - status != Cancelled
 *   - actor tier >= 2 (or 3+ if GL-posted; placeholder for Phase 2)
 */
export function cancelProject(
  projectId: string,
  cancellationReason: string,
  forceCancel?: boolean,
  actor?: EventActor
): ProjectProjection {
  const requiredTier = forceCancel ? 3 : 2;
  requireTier(actor, requiredTier as 1 | 2 | 3 | 4 | 5, 
    `Insufficient authority to cancel project (tier ${requiredTier}+ required)`);

  if (!cancellationReason || cancellationReason.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "cancellationReason is required");
  }

  const project = getProjectRow(projectId);
  if (project.status === "Cancelled") {
    throw new HttpError(400, "invalid_state", "Project is already cancelled");
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE proj_project SET status = ?, end_date = ?, version = version + 1, last_event_at = ?
       WHERE project_id = ?`
    ).run("Cancelled", timestamp, timestamp, projectId);

    const payload: EventPayload_ProjectCancelled = {
      projectId,
      cancellationReason,
      cancelledAt: timestamp,
    };

    appendEvent({
      entityId: projectId,
      entityType: "project",
      eventType: "proj.project_cancelled",
      version: project.version + 1,
      actor,
      governance: {
        riskLevel: "High",
        requiredTier: requiredTier as 1 | 2 | 3 | 4 | 5,
        governanceTag: "project_cancel",
      },
      payload: payload as unknown as Record<string, unknown>,
    });
  });

  return getProjectById(projectId) as ProjectProjection;
}

/**
 * getProjectById
 * Retrieves full project projection with WIP balances
 */
export function getProjectById(projectId: string): ProjectProjection | null {
  const row = db.prepare("SELECT * FROM proj_project WHERE project_id = ?").get(projectId) as
    | ProjectRow
    | undefined;
  if (!row) {
    return null;
  }

  return toProjectProjection(row);
}

function toProjectProjection(row: ProjectRow): ProjectProjection {
  return {
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    customerId: row.customer_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    wbsId: row.wbs_id ?? undefined,
    projectType: row.project_type,
    status: row.status,
    budgetAmount: row.budget_amount,
    baselineBudgetAmount: row.baseline_budget_amount ?? row.budget_amount,
    actualCostAmount: row.actual_cost_amount,
    revenueAmount: row.revenue_amount ?? undefined,
    defaultWIPAccountId: row.default_wip_account_id,
    defaultCloseAccountId: row.default_close_account_id,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    projectManagerId: row.project_manager_id,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    version: row.version,
    lastEventAt: row.last_event_at,
    wipMaterialBalance: row.wip_material_balance,
    wipLaborBalance: row.wip_labor_balance,
    wipTotalBalance: row.wip_total_balance,
    closedFGCost: row.closed_fg_cost ?? undefined,
    closedExpenseCost: row.closed_expense_cost ?? undefined,
  };
}

/**
 * listProjects
 * Lists all projects, paginated
 */
export function listProjects(limit = 100, offset = 0) {
  const rows = db
    .prepare(
      `SELECT * FROM proj_project ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as ProjectRow[];

  return rows.map(toProjectProjection);
}

/**
 * getProjectWIPSummary
 * Returns WIP ledger for a project
 */
export function getProjectWIPSummary(projectId: string): ProjectWIPProjection | null {
  const wip = db
    .prepare("SELECT * FROM proj_wip WHERE project_id = ?")
    .get(projectId) as ProjectWIPRow | undefined;
  if (!wip) {
    return null;
  }

  return {
    wipId: wip.wip_id,
    projectId: wip.project_id,
    wipMaterialBalance: wip.wip_material_balance,
    wipLaborBalance: wip.wip_labor_balance,
    wipOverheadBalance: wip.wip_overhead_balance,
    wipTotalBalance: wip.wip_total_balance,
    materialLineCount: wip.material_line_count,
    laborLineCount: wip.labor_line_count,
    status: wip.status,
    closedAt: wip.closed_at ?? undefined,
    closeCompletionType: wip.close_completion_type ?? undefined,
    lastMaterialPostedAt: wip.last_material_posted_at ?? undefined,
    lastLaborPostedAt: wip.last_labor_posted_at ?? undefined,
    organizationId: wip.organization_id,
    createdAt: wip.created_at,
    version: wip.version,
  };
}

export interface ProjectProgressSummary {
  projectId: string;
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  percentComplete: number;
  taskCount: number;
  completedTaskCount: number;
}

export function getProjectProgressSummary(projectId: string): ProjectProgressSummary | null {
  const project = getProjectRow(projectId);

  const tasks = db
    .prepare("SELECT estimated_hours, actual_hours, remaining_hours, status FROM proj_task WHERE project_id = ?")
    .all(projectId) as Array<{
      estimated_hours: number;
      actual_hours: number;
      remaining_hours: number;
      status: "Planned" | "InProgress" | "Completed";
    }>;

  const estimatedHours = tasks.reduce((sum, task) => sum + Number(task.estimated_hours ?? 0), 0);
  const actualHours = tasks.reduce((sum, task) => sum + Number(task.actual_hours ?? 0), 0);
  const remainingHours = tasks.reduce((sum, task) => sum + Number(task.remaining_hours ?? 0), 0);
  const completedTaskCount = tasks.filter((task) => task.status === "Completed").length;

  const percentComplete = estimatedHours > 0 ? roundMoney((actualHours / estimatedHours) * 100) : 100;

  return {
    projectId,
    estimatedHours: roundMoney(estimatedHours),
    actualHours: roundMoney(actualHours),
    remainingHours: roundMoney(remainingHours),
    percentComplete,
    taskCount: tasks.length,
    completedTaskCount,
  };
}

export interface ProjectFinancialSummary {
  projectId: string;
  budgetAmount: number;
  actualCostAmount: number;
  percentComplete: number;
  recognizedRevenue: number;
  grossMargin: number;
}

export function getProjectFinancialSummary(projectId: string): ProjectFinancialSummary | null {
  const project = getProjectRow(projectId);
  const actualCostAmount = roundMoney(Number(project.actual_cost_amount ?? 0));
  const budgetAmount = roundMoney(Number(project.budget_amount ?? 0));
  const approvedMilestoneAmount = roundMoney(
    Number(
      (
        db
          .prepare(
            "SELECT COALESCE(SUM(billing_amount), 0) AS total FROM proj_project_milestone WHERE project_id = ? AND status = 'Approved'"
          )
          .get(projectId) as { total?: number } | undefined
      )?.total ?? 0
    )
  );
  const percentComplete = budgetAmount > 0 ? roundMoney((actualCostAmount / budgetAmount) * 100) : 100;
  const milestoneDrivenRevenue = approvedMilestoneAmount > 0 ? approvedMilestoneAmount : 0;
  const recognizedRevenue = milestoneDrivenRevenue > 0 ? milestoneDrivenRevenue : roundMoney(actualCostAmount);
  const grossMargin = roundMoney(recognizedRevenue - actualCostAmount);

  return {
    projectId,
    budgetAmount,
    actualCostAmount,
    percentComplete,
    recognizedRevenue,
    grossMargin,
  };
}

export interface ProjectProfitabilitySummary {
  projectId: string;
  budgetAmount: number;
  actualCostAmount: number;
  percentComplete: number;
  recognizedRevenue: number;
  deferredRevenue: number;
  grossMargin: number;
}

export function getProjectProfitabilitySummary(projectId: string): ProjectProfitabilitySummary | null {
  const summary = getProjectFinancialSummary(projectId);
  if (!summary) {
    return null;
  }

  const deferredRevenue = Math.max(0, roundMoney(summary.actualCostAmount - summary.recognizedRevenue));

  return {
    projectId: summary.projectId,
    budgetAmount: summary.budgetAmount,
    actualCostAmount: summary.actualCostAmount,
    percentComplete: summary.percentComplete,
    recognizedRevenue: summary.recognizedRevenue,
    deferredRevenue,
    grossMargin: summary.grossMargin,
  };
}

export interface ProjectRiskProjection {
  riskId: string;
  projectId: string;
  title: string;
  probabilityPercent: number;
  impactAmount: number;
  financialExposure: number;
  createdAt: string;
  updatedAt: string;
}

export function createProjectRisk(
  projectId: string,
  input: { title: string; probabilityPercent: number; impactAmount: number },
  actor?: EventActor
): ProjectRiskProjection {
  const project = getProjectRow(projectId);
  const title = input.title?.trim();
  if (!title) {
    throw new HttpError(400, "invalid_request", "title is required");
  }

  const probabilityPercent = Number(input.probabilityPercent);
  if (!Number.isFinite(probabilityPercent) || probabilityPercent < 0 || probabilityPercent > 100) {
    throw new HttpError(400, "invalid_request", "probabilityPercent must be between 0 and 100");
  }

  const impactAmount = Number(input.impactAmount);
  if (!Number.isFinite(impactAmount) || impactAmount < 0) {
    throw new HttpError(400, "invalid_request", "impactAmount must be a non-negative number");
  }

  const financialExposure = roundMoney((probabilityPercent / 100) * impactAmount);
  const riskId = newId("RISK-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO proj_project_risk(risk_id, project_id, title, probability_percent, impact_amount, financial_exposure, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(riskId, projectId, title, probabilityPercent, impactAmount, financialExposure, timestamp, timestamp);

  appendEvent({
    entityId: projectId,
    entityType: "project",
    eventType: "proj.risk_added",
    version: 1,
    actor,
    payload: {
      riskId,
      projectId,
      title,
      probabilityPercent,
      impactAmount,
      financialExposure,
    } as unknown as Record<string, unknown>,
  });

  const row = db.prepare("SELECT * FROM proj_project_risk WHERE risk_id = ?").get(riskId) as {
    risk_id: string;
    project_id: string;
    title: string;
    probability_percent: number;
    impact_amount: number;
    financial_exposure: number;
    created_at: string;
    updated_at: string;
  };

  return {
    riskId: row.risk_id,
    projectId: row.project_id,
    title: row.title,
    probabilityPercent: row.probability_percent,
    impactAmount: row.impact_amount,
    financialExposure: row.financial_exposure,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProjectChangeRequestProjection {
  changeRequestId: string;
  projectId: string;
  title: string;
  description?: string;
  originalBudgetAmount: number;
  deltaBudgetAmount: number;
  revisedBudgetAmount: number;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  approvedAt?: string;
  createdBy?: string;
  updatedAt: string;
}

export function createProjectChangeRequest(
  projectId: string,
  input: { title: string; description?: string; deltaBudgetAmount: number },
  actor?: EventActor
): ProjectChangeRequestProjection {
  const project = getProjectRow(projectId);
  const title = input.title?.trim();
  if (!title) {
    throw new HttpError(400, "invalid_request", "title is required");
  }

  const deltaBudgetAmount = Number(input.deltaBudgetAmount ?? 0);
  if (!Number.isFinite(deltaBudgetAmount) || deltaBudgetAmount < 0) {
    throw new HttpError(400, "invalid_request", "deltaBudgetAmount must be a non-negative number");
  }

  const changeRequestId = newId("CRQ-");
  const timestamp = now();
  const originalBudgetAmount = Number(project.budget_amount ?? 0);
  const revisedBudgetAmount = roundMoney(originalBudgetAmount + deltaBudgetAmount);

  db.prepare(
    `INSERT INTO proj_project_change_request(
      change_request_id, project_id, title, description, original_budget_amount, delta_budget_amount,
      revised_budget_amount, status, created_at, approved_at, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    changeRequestId,
    projectId,
    title,
    input.description?.trim() || null,
    originalBudgetAmount,
    deltaBudgetAmount,
    revisedBudgetAmount,
    "Pending",
    timestamp,
    null,
    actor?.id ?? "system",
    timestamp
  );

  const row = db.prepare("SELECT * FROM proj_project_change_request WHERE change_request_id = ?").get(changeRequestId) as any;

  return {
    changeRequestId: row.change_request_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    originalBudgetAmount: row.original_budget_amount,
    deltaBudgetAmount: row.delta_budget_amount,
    revisedBudgetAmount: row.revised_budget_amount,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function approveProjectChangeRequest(
  projectId: string,
  changeRequestId: string,
  actor?: EventActor
): ProjectChangeRequestProjection {
  const project = getProjectRow(projectId);
  const row = db
    .prepare("SELECT * FROM proj_project_change_request WHERE project_id = ? AND change_request_id = ?")
    .get(projectId, changeRequestId) as any;

  if (!row) {
    throw new HttpError(404, "not_found", "Change request not found");
  }

  if (row.status === "Approved") {
    return {
      changeRequestId: row.change_request_id,
      projectId: row.project_id,
      title: row.title,
      description: row.description ?? undefined,
      originalBudgetAmount: row.original_budget_amount,
      deltaBudgetAmount: row.delta_budget_amount,
      revisedBudgetAmount: row.revised_budget_amount,
      status: row.status,
      createdAt: row.created_at,
      approvedAt: row.approved_at ?? undefined,
      createdBy: row.created_by ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  const timestamp = now();
  db.prepare(
    `UPDATE proj_project_change_request
     SET status = 'Approved', approved_at = ?, updated_at = ?
     WHERE change_request_id = ?`
  ).run(timestamp, timestamp, changeRequestId);

  db.prepare(
    `UPDATE proj_project
     SET budget_amount = ?, baseline_budget_amount = COALESCE(baseline_budget_amount, budget_amount), updated_at = ?
     WHERE project_id = ?`
  ).run(roundMoney(Number(row.revised_budget_amount)), timestamp, projectId);

  const updated = db.prepare("SELECT * FROM proj_project_change_request WHERE change_request_id = ?").get(changeRequestId) as any;
  const refreshed = getProjectById(projectId) as ProjectProjection;

  return {
    changeRequestId: updated.change_request_id,
    projectId: updated.project_id,
    title: updated.title,
    description: updated.description ?? undefined,
    originalBudgetAmount: updated.original_budget_amount,
    deltaBudgetAmount: updated.delta_budget_amount,
    revisedBudgetAmount: updated.revised_budget_amount,
    status: updated.status,
    createdAt: updated.created_at,
    approvedAt: updated.approved_at ?? undefined,
    createdBy: updated.created_by ?? undefined,
    updatedAt: updated.updated_at,
  };
}

export interface ProjectStageGateProjection {
  gateId: string;
  projectId: string;
  phaseName: string;
  requiredSignoffs: string[];
  approvals: string[];
  isReady: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMilestoneProjection {
  milestoneId: string;
  projectId: string;
  name: string;
  phaseName: string;
  billingAmount: number;
  status: "Planned" | "Approved" | "Completed";
  readyForBilling: boolean;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function createProjectMilestone(
  projectId: string,
  input: { name: string; phaseName?: string; billingAmount: number },
  actor?: EventActor
): ProjectMilestoneProjection {
  const project = getProjectRow(projectId);
  const name = input.name?.trim();
  if (!name) {
    throw new HttpError(400, "invalid_request", "name is required");
  }

  const phaseName = (input.phaseName ?? "General").trim() || "General";
  const billingAmount = Number(input.billingAmount ?? 0);
  if (!Number.isFinite(billingAmount) || billingAmount < 0) {
    throw new HttpError(400, "invalid_request", "billingAmount must be a non-negative number");
  }

  const milestoneId = newId("MILESTONE-");
  const timestamp = now();

  db.prepare(
    `INSERT INTO proj_project_milestone(
      milestone_id, project_id, name, phase_name, billing_amount, status, ready_for_billing,
      approved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(milestoneId, projectId, name, phaseName, roundMoney(billingAmount), "Planned", 0, null, timestamp, timestamp);

  const row = db.prepare("SELECT * FROM proj_project_milestone WHERE milestone_id = ?").get(milestoneId) as any;
  return {
    milestoneId: row.milestone_id,
    projectId: row.project_id,
    name: row.name,
    phaseName: row.phase_name,
    billingAmount: Number(row.billing_amount ?? 0),
    status: row.status,
    readyForBilling: Boolean(row.ready_for_billing),
    approvedAt: row.approved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function approveProjectMilestone(
  projectId: string,
  milestoneId: string,
  actor?: EventActor
): ProjectMilestoneProjection {
  const project = getProjectRow(projectId);
  const row = db
    .prepare("SELECT * FROM proj_project_milestone WHERE project_id = ? AND milestone_id = ?")
    .get(projectId, milestoneId) as any;

  if (!row) {
    throw new HttpError(404, "not_found", "Milestone not found");
  }

  const gate = db
    .prepare("SELECT * FROM proj_stage_gate WHERE project_id = ? AND phase_name = ?")
    .get(projectId, row.phase_name) as any;

  if (!gate || !Boolean(gate.is_ready)) {
    throw new HttpError(409, "stage_gate_locked", `Phase '${row.phase_name}' is not ready for billing approval`);
  }

  const timestamp = now();
  db.prepare(
    `UPDATE proj_project_milestone
     SET status = 'Approved', ready_for_billing = 1, approved_at = ?, updated_at = ?
     WHERE milestone_id = ?`
  ).run(timestamp, timestamp, milestoneId);

  const updated = db.prepare("SELECT * FROM proj_project_milestone WHERE milestone_id = ?").get(milestoneId) as any;
  return {
    milestoneId: updated.milestone_id,
    projectId: updated.project_id,
    name: updated.name,
    phaseName: updated.phase_name,
    billingAmount: Number(updated.billing_amount ?? 0),
    status: updated.status,
    readyForBilling: Boolean(updated.ready_for_billing),
    approvedAt: updated.approved_at ?? undefined,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

export function upsertProjectStageGate(
  projectId: string,
  input: { phaseName: string; requiredSignoffs: string[]; approvals: string[] },
  actor?: EventActor
): ProjectStageGateProjection {
  const project = getProjectRow(projectId);
  const phaseName = input.phaseName?.trim();
  if (!phaseName) {
    throw new HttpError(400, "invalid_request", "phaseName is required");
  }

  const requiredSignoffs = (input.requiredSignoffs ?? []).map((v) => String(v).trim()).filter(Boolean);
  const approvals = (input.approvals ?? []).map((v) => String(v).trim()).filter(Boolean);
  const isReady = requiredSignoffs.length > 0 ? requiredSignoffs.every((item) => approvals.includes(item)) : approvals.length > 0;
  const gateId = newId("GATE-");
  const timestamp = now();

  const existing = db
    .prepare("SELECT * FROM proj_stage_gate WHERE project_id = ? AND phase_name = ?")
    .get(projectId, phaseName) as { gate_id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE proj_stage_gate
       SET required_signoffs = ?, approvals = ?, is_ready = ?, updated_at = ?
       WHERE gate_id = ?`
    ).run(JSON.stringify(requiredSignoffs), JSON.stringify(approvals), isReady ? 1 : 0, timestamp, existing.gate_id);

    const updated = db.prepare("SELECT * FROM proj_stage_gate WHERE gate_id = ?").get(existing.gate_id) as any;
    return {
      gateId: updated.gate_id,
      projectId: updated.project_id,
      phaseName: updated.phase_name,
      requiredSignoffs: JSON.parse(updated.required_signoffs || "[]"),
      approvals: JSON.parse(updated.approvals || "[]"),
      isReady: Boolean(updated.is_ready),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  db.prepare(
    `INSERT INTO proj_stage_gate(gate_id, project_id, phase_name, required_signoffs, approvals, is_ready, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(gateId, projectId, phaseName, JSON.stringify(requiredSignoffs), JSON.stringify(approvals), isReady ? 1 : 0, timestamp, timestamp);

  const row = db.prepare("SELECT * FROM proj_stage_gate WHERE gate_id = ?").get(gateId) as any;
  return {
    gateId: row.gate_id,
    projectId: row.project_id,
    phaseName: row.phase_name,
    requiredSignoffs: JSON.parse(row.required_signoffs || "[]"),
    approvals: JSON.parse(row.approvals || "[]"),
    isReady: Boolean(row.is_ready),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function advanceProjectPhase(projectId: string, phaseName: string, actor?: EventActor): ProjectStageGateProjection {
  const project = getProjectRow(projectId);
  const gate = db
    .prepare("SELECT * FROM proj_stage_gate WHERE project_id = ? AND phase_name = ?")
    .get(projectId, phaseName) as any;

  if (!gate) {
    throw new HttpError(404, "not_found", `No stage gate found for phase '${phaseName}'`);
  }

  const requiredSignoffs = JSON.parse(gate.required_signoffs || "[]");
  const approvals = JSON.parse(gate.approvals || "[]");
  const isReady = requiredSignoffs.every((item: string) => approvals.includes(item));

  if (!isReady) {
    throw new HttpError(409, "stage_gate_locked", `Project cannot advance to phase '${phaseName}' until all required sign-offs are recorded`);
  }

  db.prepare("UPDATE proj_stage_gate SET is_ready = 1, updated_at = ? WHERE gate_id = ?").run(now(), gate.gate_id);

  const updated = db.prepare("SELECT * FROM proj_stage_gate WHERE gate_id = ?").get(gate.gate_id) as any;
  return {
    gateId: updated.gate_id,
    projectId: updated.project_id,
    phaseName: updated.phase_name,
    requiredSignoffs: JSON.parse(updated.required_signoffs || "[]"),
    approvals: JSON.parse(updated.approvals || "[]"),
    isReady: Boolean(updated.is_ready),
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

interface BomAssignmentRow {
  assignment_id: string;
  project_id: string;
  wbs_id: string | null;
  bom_id: string;
  quantity_planned: number;
  status: "Active" | "Cancelled";
  created_at: string;
  updated_at: string;
}

function rowToBomAssignment(row: BomAssignmentRow): BomAssignmentProjection {
  return {
    assignmentId: row.assignment_id,
    projectId: row.project_id,
    wbsId: row.wbs_id ?? undefined,
    bomId: row.bom_id,
    quantityPlanned: row.quantity_planned,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * assignBomToProject
 * Links a BOM to an Active project, emitting proj.bom.assigned event.
 */
export function assignBomToProject(
  input: {
    projectId: string;
    bomId: string;
    wbsId?: string;
    quantityPlanned: number;
  },
  actor?: EventActor
): BomAssignmentProjection {
  const project = db
    .prepare("SELECT * FROM proj_project WHERE project_id = ?")
    .get(input.projectId) as ProjectRow | undefined;
  if (!project) {
    throw new HttpError(404, "project_not_found", `Project '${input.projectId}' not found`);
  }
  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", `Project must be Active to assign a BOM (current: ${project.status})`);
  }

  const bom = db
    .prepare("SELECT bom_id, status FROM inv_bom_header WHERE bom_id = ?")
    .get(input.bomId) as { bom_id: string; status: string } | undefined;
  if (!bom) {
    throw new HttpError(404, "bom_not_found", `BOM '${input.bomId}' not found`);
  }

  const assignmentId = newId("BASSIGN-");
  const ts = now();

  const payload: EventPayload_BomAssigned = {
    assignmentId,
    projectId: input.projectId,
    wbsId: input.wbsId,
    bomId: input.bomId,
    quantityPlanned: input.quantityPlanned,
  };

  transaction(() => {
    db.prepare(
      `INSERT INTO proj_bom_assignment(assignment_id, project_id, wbs_id, bom_id, quantity_planned, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)`
    ).run(assignmentId, input.projectId, input.wbsId ?? null, input.bomId, input.quantityPlanned, ts, ts);

    appendEvent({
      entityId: input.projectId,
      entityType: "project",
      eventType: "proj.bom.assigned",
      version: 1,
      governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "proj_bom_assigned" },
      payload: payload as unknown as Record<string, unknown>,
    });
  });

  return rowToBomAssignment(
    db.prepare("SELECT * FROM proj_bom_assignment WHERE assignment_id = ?").get(assignmentId) as BomAssignmentRow
  );
}

/**
 * listProjectBomAssignments
 * Returns all BOM assignments for a project
 */
export function listProjectBomAssignments(projectId: string): BomAssignmentProjection[] {
  const rows = db
    .prepare("SELECT * FROM proj_bom_assignment WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as BomAssignmentRow[];
  return rows.map(rowToBomAssignment);
}

interface ServiceBomRequirementRow {
  requirement_id: string;
  project_id: string;
  wbs_id: string | null;
  role: string;
  estimated_hours: number;
  required_skill: string | null;
  required_certification: string | null;
  status: "Active" | "Closed";
  created_at: string;
  updated_at: string;
}

export interface ServiceBomRequirementProjection {
  requirementId: string;
  projectId: string;
  wbsId?: string;
  role: string;
  estimatedHours: number;
  requiredSkill?: string;
  requiredCertification?: string;
  status: "Active" | "Closed";
  createdAt: string;
  updatedAt: string;
}

function rowToServiceBomRequirement(row: ServiceBomRequirementRow): ServiceBomRequirementProjection {
  return {
    requirementId: row.requirement_id,
    projectId: row.project_id,
    wbsId: row.wbs_id ?? undefined,
    role: row.role,
    estimatedHours: row.estimated_hours,
    requiredSkill: row.required_skill ?? undefined,
    requiredCertification: row.required_certification ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProjectServiceBomRequirement(
  projectId: string,
  input: {
    wbsId?: string;
    role: string;
    estimatedHours: number;
    requiredSkill?: string;
    requiredCertification?: string;
    status?: "Active" | "Closed";
  },
  actor?: EventActor
): ServiceBomRequirementProjection {
  const project = getProjectRow(projectId);
  if (!project) {
    throw new HttpError(404, "not_found", "Project not found");
  }

  const role = (input.role ?? "").trim();
  if (!role) {
    throw new HttpError(400, "invalid_request", "role is required");
  }

  const estimatedHours = Number(input.estimatedHours);
  if (!Number.isFinite(estimatedHours) || estimatedHours < 0) {
    throw new HttpError(400, "invalid_request", "estimatedHours must be a non-negative number");
  }

  const requirementId = newId("SBR-");
  const ts = now();
  const status = input.status ?? "Active";
  const wbsId = (input.wbsId ?? project.wbs_id ?? "").trim() || null;
  const requiredSkill = (input.requiredSkill ?? "").trim() || null;
  const requiredCertification = (input.requiredCertification ?? "").trim() || null;

  db.prepare(
    `INSERT INTO proj_service_bom_requirement(
      requirement_id, project_id, wbs_id, role, estimated_hours, required_skill,
      required_certification, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    requirementId,
    projectId,
    wbsId,
    role,
    estimatedHours,
    requiredSkill,
    requiredCertification,
    status,
    ts,
    ts
  );

  appendEvent({
    entityId: requirementId,
    entityType: "project_service_bom_requirement",
    eventType: "proj.service_bom_requirement_created",
    version: 1,
    actor,
    payload: {
      requirementId,
      projectId,
      wbsId,
      role,
      estimatedHours,
      requiredSkill,
      requiredCertification,
      status,
    } as unknown as Record<string, unknown>,
  });

  return rowToServiceBomRequirement(
    db.prepare("SELECT * FROM proj_service_bom_requirement WHERE requirement_id = ?").get(requirementId) as ServiceBomRequirementRow
  );
}

export function listProjectServiceBomRequirements(projectId: string): ServiceBomRequirementProjection[] {
  const rows = db
    .prepare("SELECT * FROM proj_service_bom_requirement WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as ServiceBomRequirementRow[];
  return rows.map(rowToServiceBomRequirement);
}

// ─── Task Tracking ─────────────────────────────────────────────────────────────

interface ProjectTaskRow {
  task_id: string;
  project_id: string;
  name: string;
  description: string | null;
  assigned_to: string | null;
  required_skill: string | null;
  estimated_hours: number;
  actual_hours: number;
  remaining_hours: number;
  percent_complete: number;
  status: "Planned" | "InProgress" | "Completed";
  created_at: string;
  updated_at: string;
}

export interface ProjectTaskProjection {
  taskId: string;
  projectId: string;
  name: string;
  description?: string;
  assignedTo?: string;
  requiredSkill?: string;
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  percentComplete: number;
  status: "Planned" | "InProgress" | "Completed";
  createdAt: string;
  updatedAt: string;
}

function rowToProjectTask(row: ProjectTaskRow): ProjectTaskProjection {
  return {
    taskId: row.task_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    requiredSkill: row.required_skill ?? undefined,
    estimatedHours: row.estimated_hours,
    actualHours: row.actual_hours,
    remainingHours: row.remaining_hours,
    percentComplete: row.percent_complete,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getProjectTaskById(taskId: string): ProjectTaskProjection | null {
  const row = db.prepare("SELECT * FROM proj_task WHERE task_id = ?").get(taskId) as ProjectTaskRow | undefined;
  return row ? rowToProjectTask(row) : null;
}

export function listProjectTasks(projectId: string): ProjectTaskProjection[] {
  const rows = db
    .prepare("SELECT * FROM proj_task WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as ProjectTaskRow[];
  return rows.map(rowToProjectTask);
}

export function createProjectTask(
  projectId: string,
  input: {
    name: string;
    description?: string;
    assignedTo?: string;
    requiredSkill?: string;
    estimatedHours?: number;
    remainingHours?: number;
    status?: "Planned" | "InProgress" | "Completed";
  },
  actor?: EventActor
): ProjectTaskProjection {
  const project = getProjectRow(projectId);
  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", "Tasks can only be created for an Active project");
  }

  const estimatedHours = Number(input.estimatedHours ?? input.remainingHours ?? 0);
  if (!Number.isFinite(estimatedHours) || estimatedHours < 0) {
    throw new HttpError(400, "invalid_request", "estimatedHours must be a non-negative number");
  }

  const remainingHours = Number(input.remainingHours ?? estimatedHours);
  if (!Number.isFinite(remainingHours) || remainingHours < 0) {
    throw new HttpError(400, "invalid_request", "remainingHours must be a non-negative number");
  }

  const taskId = newId("TASK-");
  const timestamp = now();
  const status = input.status ?? (remainingHours > 0 ? "Planned" : "Completed");
  const requiredSkill = input.requiredSkill?.trim() || null;

  db.prepare(
    `INSERT INTO proj_task(
      task_id, project_id, name, description, assigned_to, required_skill,
      estimated_hours, actual_hours, remaining_hours, percent_complete, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taskId,
    projectId,
    input.name,
    input.description ?? null,
    input.assignedTo ?? null,
    requiredSkill,
    estimatedHours,
    0,
    remainingHours,
    estimatedHours > 0 ? 0 : 100,
    status,
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taskId,
    entityType: "project_task",
    eventType: "proj.task_created",
    version: 1,
    actor,
    payload: {
      taskId,
      projectId,
      name: input.name,
      description: input.description,
      assignedTo: input.assignedTo,
      requiredSkill,
      estimatedHours,
      remainingHours,
      status,
    } as unknown as Record<string, unknown>,
  });

  return getProjectTaskById(taskId)!;
}

interface ProjectTaskAllocationRow {
  allocation_id: string;
  task_id: string;
  project_id: string;
  resource_id: string;
  resource_type: "employee" | "contractor";
  role: string | null;
  allocated_hours: number;
  work_date: string | null;
  status: "Planned" | "Active" | "Completed" | "Cancelled";
  created_at: string;
  updated_at: string;
}

export interface ProjectTaskAllocationProjection {
  allocationId: string;
  taskId: string;
  projectId: string;
  resourceId: string;
  resourceType: "employee" | "contractor";
  role?: string;
  allocatedHours: number;
  workDate?: string;
  status: "Planned" | "Active" | "Completed" | "Cancelled";
  createdAt: string;
  updatedAt: string;
}

function rowToProjectTaskAllocation(row: ProjectTaskAllocationRow): ProjectTaskAllocationProjection {
  return {
    allocationId: row.allocation_id,
    taskId: row.task_id,
    projectId: row.project_id,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    role: row.role ?? undefined,
    allocatedHours: row.allocated_hours,
    workDate: row.work_date ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTaskAllocations(taskId: string): ProjectTaskAllocationProjection[] {
  const rows = db
    .prepare("SELECT * FROM proj_task_allocation WHERE task_id = ? ORDER BY created_at ASC")
    .all(taskId) as ProjectTaskAllocationRow[];
  return rows.map(rowToProjectTaskAllocation);
}

export function createTaskAllocation(
  projectId: string,
  taskId: string,
  input: {
    resourceId: string;
    resourceType?: "employee" | "contractor";
    role?: string;
    allocatedHours: number;
    skillRequired?: string;
    workDate?: string;
  },
  actor?: EventActor
): ProjectTaskAllocationProjection {
  const task = getProjectTaskById(taskId);
  if (!task || task.projectId !== projectId) {
    throw new HttpError(404, "not_found", "Task not found for project");
  }

  const resourceType = input.resourceType ?? "employee";
  const allocatedHours = Number(input.allocatedHours);
  if (!Number.isFinite(allocatedHours) || allocatedHours <= 0) {
    throw new HttpError(400, "invalid_request", "allocatedHours must be a positive number");
  }

  if (!input.resourceId || input.resourceId.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "resourceId is required");
  }

  const requiredSkill = (task.requiredSkill ?? input.skillRequired ?? "").trim();
  if (requiredSkill && resourceType === "employee") {
    const hasSkill = db
      .prepare("SELECT 1 FROM h2r_employee_skill WHERE employee_id = ? AND LOWER(skill_name) = LOWER(?) LIMIT 1")
      .get(input.resourceId, requiredSkill) as { 1: number } | undefined;

    if (!hasSkill) {
      throw new HttpError(409, "insufficient_skill", `Resource '${input.resourceId}' does not have the required skill '${requiredSkill}'`);
    }
  }

  const explicitWorkDate = (input.workDate ?? "").trim();
  const defaultWorkDate = !explicitWorkDate && resourceType === "employee"
    ? ((db
        .prepare(
          "SELECT work_date FROM h2r_employee_availability WHERE employee_id = ? ORDER BY work_date DESC LIMIT 1"
        )
        .get(input.resourceId) as { work_date: string } | undefined)?.work_date ?? "")
    : explicitWorkDate;
  const resolvedWorkDate = defaultWorkDate;

  if (resourceType === "employee" && resolvedWorkDate) {
    const availability = db
      .prepare("SELECT available_hours FROM h2r_employee_availability WHERE employee_id = ? AND work_date = ?")
      .get(input.resourceId, resolvedWorkDate) as { available_hours: number } | undefined;

    const scheduledHours = Number(
      (
        db
          .prepare(
            "SELECT COALESCE(SUM(allocated_hours), 0) AS total FROM proj_task_allocation WHERE resource_id = ? AND resource_type = ? AND work_date = ?"
          )
          .get(input.resourceId, resourceType, resolvedWorkDate) as { total: number } | undefined
      )?.total ?? 0
    );

    if (!availability) {
      throw new HttpError(409, "insufficient_availability", `Resource '${input.resourceId}' has no availability recorded for ${resolvedWorkDate}`);
    }

    if (scheduledHours + allocatedHours > availability.available_hours) {
      throw new HttpError(
        409,
        "insufficient_availability",
        `Resource '${input.resourceId}' only has ${availability.available_hours} available hours on ${resolvedWorkDate}`
      );
    }
  }

  const existing = db
    .prepare(
      "SELECT * FROM proj_task_allocation WHERE task_id = ? AND resource_id = ? AND resource_type = ?"
    )
    .get(taskId, input.resourceId, resourceType) as ProjectTaskAllocationRow | undefined;

  if (existing) {
    throw new HttpError(409, "conflict", "Resource is already allocated to this task");
  }

  const currentTotal = listTaskAllocations(taskId).reduce((sum, row) => sum + row.allocatedHours, 0);
  const projectedTotal = currentTotal + allocatedHours;
  if (projectedTotal > task.estimatedHours && task.estimatedHours > 0) {
    throw new HttpError(409, "over_allocation", "Allocated hours exceed the task's estimated hours");
  }

  const allocationId = newId("ALLOC-");
  const timestamp = now();
  const workDate = resolvedWorkDate;

  db.prepare(
    `INSERT INTO proj_task_allocation(
      allocation_id, task_id, project_id, resource_id, resource_type,
      role, allocated_hours, work_date, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    allocationId,
    taskId,
    projectId,
    input.resourceId,
    resourceType,
    input.role ?? null,
    allocatedHours,
    resolvedWorkDate,
    "Planned",
    timestamp,
    timestamp
  );

  appendEvent({
    entityId: taskId,
    entityType: "project_task",
    eventType: "proj.task_allocation_created",
    version: 1,
    actor,
    payload: {
      allocationId,
      taskId,
      projectId,
      resourceId: input.resourceId,
      resourceType,
      role: input.role,
      allocatedHours,
      workDate,
    } as unknown as Record<string, unknown>,
  });

  return rowToProjectTaskAllocation(
    db.prepare("SELECT * FROM proj_task_allocation WHERE allocation_id = ?").get(allocationId) as ProjectTaskAllocationRow
  );
}

export function logTaskHours(
  projectId: string,
  taskId: string,
  input: {
    hours: number;
    resourceId: string;
    rate: number;
    costElementId?: string;
  },
  actor?: EventActor
): { task: ProjectTaskProjection; entry: ReturnType<typeof postLaborCost> } {
  const task = getProjectTaskById(taskId);
  if (!task || task.projectId !== projectId) {
    throw new HttpError(404, "not_found", "Task not found for project");
  }

  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new HttpError(400, "invalid_request", "hours must be a positive number");
  }

  const project = getProjectRow(projectId);
  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", "Task hours can only be logged against an Active project");
  }

  const entry = postLaborCost(
    {
      projectId,
      wbsId: project.wbs_id ?? undefined,
      resourceId: input.resourceId,
      hours,
      rate: Number(input.rate),
      costElementId: input.costElementId,
    },
    actor
  );

  const updatedActualHours = roundMoney(task.actualHours + hours);
  const updatedRemaining = Math.max(0, roundMoney(task.remainingHours - hours));
  const updatedPercent = task.estimatedHours > 0 ? roundMoney((updatedActualHours / task.estimatedHours) * 100) : 100;
  const updatedStatus = updatedRemaining > 0 ? "InProgress" : "Completed";
  const updatedAt = now();

  db.prepare(
    `UPDATE proj_task
     SET actual_hours = ?, remaining_hours = ?, percent_complete = ?, status = ?, updated_at = ?
     WHERE task_id = ?`
  ).run(updatedActualHours, updatedRemaining, updatedPercent, updatedStatus, updatedAt, taskId);

  const updatedTask = getProjectTaskById(taskId)!;

  appendEvent({
    entityId: taskId,
    entityType: "project_task",
    eventType: "proj.task_hours_logged",
    version: 1,
    actor,
    payload: {
      taskId,
      projectId,
      hours,
      actualHours: updatedActualHours,
      remainingHours: updatedRemaining,
      percentComplete: updatedPercent,
      resourceId: input.resourceId,
    } as unknown as Record<string, unknown>,
  });

  return { task: updatedTask, entry };
}

// ─── Labour Costing ───────────────────────────────────────────────────────────

interface LaborEntryRow {
  entry_id: string;
  project_id: string;
  wip_id: string;
  wbs_id: string | null;
  resource_id: string;
  hours: number;
  rate: number;
  total_cost: number;
  cost_element_id: string | null;
  posted_at: string;
  created_at: string;
}

function rowToLaborEntry(row: LaborEntryRow): LaborEntryProjection {
  return {
    entryId: row.entry_id,
    projectId: row.project_id,
    wipId: row.wip_id,
    wbsId: row.wbs_id ?? undefined,
    resourceId: row.resource_id,
    hours: row.hours,
    rate: row.rate,
    totalCost: row.total_cost,
    costElementId: row.cost_element_id ?? undefined,
    postedAt: row.posted_at,
    createdAt: row.created_at,
  };
}

export interface PostLaborCostInput {
  projectId: string;
  wbsId?: string;
  resourceId: string;
  hours: number;
  rate: number;
  costElementId?: string;
}

export function postLaborCost(input: PostLaborCostInput, actor?: EventActor): LaborEntryProjection {
  const project = getProjectRow(input.projectId);

  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", "Labour can only be posted to an Active project");
  }

  const wip = db
    .prepare("SELECT * FROM proj_wip WHERE project_id = ? AND status = 'Open'")
    .get(input.projectId) as ProjectWIPRow | undefined;

  if (!wip) {
    throw new HttpError(409, "wip_not_found", "No open WIP record found for this project");
  }

  const entryId = newId("LABR");
  const totalCost = roundMoney(input.hours * input.rate);
  const ts = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO proj_labor_entry(entry_id, project_id, wip_id, wbs_id, resource_id, hours, rate, total_cost, cost_element_id, posted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(entryId, input.projectId, wip.wip_id, input.wbsId ?? null, input.resourceId, input.hours, input.rate, totalCost, input.costElementId ?? null, ts, ts);

    db.prepare(
      `UPDATE proj_wip
       SET wip_labor_balance = wip_labor_balance + ?,
           wip_total_balance  = wip_total_balance  + ?,
           labor_line_count   = labor_line_count   + 1,
           last_labor_posted_at = ?,
           version            = version + 1
       WHERE wip_id = ?`
    ).run(totalCost, totalCost, ts, wip.wip_id);

    db.prepare(
      `UPDATE proj_project
       SET wip_labor_balance = wip_labor_balance + ?,
           wip_total_balance  = wip_total_balance  + ?,
           actual_cost_amount = actual_cost_amount + ?,
           version            = version + 1,
           last_event_at      = ?
       WHERE project_id = ?`
    ).run(totalCost, totalCost, totalCost, ts, input.projectId);
  });

  const payload: EventPayload_LaborCosted = {
    entryId,
    projectId: input.projectId,
    wbsId: input.wbsId,
    resourceId: input.resourceId,
    hours: input.hours,
    rate: input.rate,
    totalCost,
    costElementId: input.costElementId,
  };

  appendEvent({
    entityId: input.projectId,
    entityType: "project",
    eventType: "proj.labor.costed",
    version: 1,
    governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "proj_labor_costed" },
    payload: payload as unknown as Record<string, unknown>,
    actor,
  });

  const row = db.prepare("SELECT * FROM proj_labor_entry WHERE entry_id = ?").get(entryId) as LaborEntryRow;
  return rowToLaborEntry(row);
}

export function listLaborEntries(projectId: string): LaborEntryProjection[] {
  const rows = db
    .prepare("SELECT * FROM proj_labor_entry WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as LaborEntryRow[];
  return rows.map(rowToLaborEntry);
}

// ─── Finished-Item Creation ───────────────────────────────────────────────────

interface FinishedItemRow {
  finished_item_id: string;
  project_id: string;
  wip_id: string;
  sku_id: string;
  organization_id: string;
  quantity: number;
  unit_cost: number;
  total_wip_cost: number;
  movement_id: string | null;
  created_at: string;
}

function rowToFinishedItem(row: FinishedItemRow): FinishedItemProjection {
  return {
    finishedItemId: row.finished_item_id,
    projectId: row.project_id,
    wipId: row.wip_id,
    skuId: row.sku_id,
    organizationId: row.organization_id,
    quantity: row.quantity,
    unitCost: row.unit_cost,
    totalWipCost: row.total_wip_cost,
    movementId: row.movement_id ?? undefined,
    createdAt: row.created_at,
  };
}

  interface ProjectRequisitionRow {
    requisition_id: string;
    requester: string;
    department: string | null;
    state: string;
    total_amount: number;
    currency_code: string | null;
    needed_by_date: string | null;
    legal_entity_id: string | null;
    project_id: string | null;
    wbs_id: string | null;
    created_at: string;
    updated_at: string;
  }

  interface ProjectPurchaseOrderRow {
    po_id: string;
    requisition_id: string | null;
    supplier_id: string;
    state: string;
    total_amount: number;
    currency_code: string | null;
    delivery_address: string | null;
    legal_entity_id: string | null;
    project_id: string | null;
    wbs_id: string | null;
    created_at: string;
    updated_at: string;
  }

  interface ProjectSalesOrderRow {
    order_id: string;
    quote_id: string | null;
    customer_id: string;
    state: string;
    currency_code: string;
    total_amount: number;
    legal_entity_id: string | null;
    project_id: string | null;
    wbs_id: string | null;
    created_at: string;
    updated_at: string;
  }

  export interface ProjectRequisitionProjection {
    requisitionId: string;
    requester: string;
    department?: string;
    state: string;
    totalAmount: number;
    currencyCode?: string;
    neededByDate?: string;
    legalEntityId?: string;
    projectId?: string;
    wbsId?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface ProjectPurchaseOrderProjection {
    poId: string;
    requisitionId?: string;
    supplierId: string;
    state: string;
    totalAmount: number;
    currencyCode?: string;
    deliveryAddress?: string;
    legalEntityId?: string;
    projectId?: string;
    wbsId?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface ProjectSalesOrderProjection {
    orderId: string;
    quoteId?: string;
    customerId: string;
    state: string;
    currencyCode: string;
    totalAmount: number;
    legalEntityId?: string;
    projectId?: string;
    wbsId?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface ProjectProcurementPreviewLine {
    skuId: string;
    organizationId: string;
    quantityUom: string;
    requiredQuantity: number;
    onHandQuantity: number;
    shortageQuantity: number;
    suggestedUnitPrice: number;
    sourceBomIds: string[];
    sourceAssignmentIds: string[];
  }

  export interface ProjectProcurementPreview {
    projectId: string;
    generatedAt: string;
    lineCount: number;
    shortageLineCount: number;
    totalRequiredQuantity: number;
    totalShortageQuantity: number;
    lines: ProjectProcurementPreviewLine[];
  }

  export interface GenerateProjectRequisitionLinesInput {
    requisitionId?: string;
    requester?: string;
    department?: string;
    currencyCode?: string;
    neededByDate?: string;
    legalEntityId?: string;
  }

  export interface ProjectRequisitionGenerationResult {
    projectId: string;
    requisitionId: string;
    generatedLineCount: number;
    skippedLineCount: number;
    totalShortageQuantity: number;
    preview: ProjectProcurementPreview;
  }

  function rowToProjectRequisition(row: ProjectRequisitionRow): ProjectRequisitionProjection {
    return {
      requisitionId: row.requisition_id,
      requester: row.requester,
      department: row.department ?? undefined,
      state: row.state,
      totalAmount: row.total_amount,
      currencyCode: row.currency_code ?? undefined,
      neededByDate: row.needed_by_date ?? undefined,
      legalEntityId: row.legal_entity_id ?? undefined,
      projectId: row.project_id ?? undefined,
      wbsId: row.wbs_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function rowToProjectPurchaseOrder(row: ProjectPurchaseOrderRow): ProjectPurchaseOrderProjection {
    return {
      poId: row.po_id,
      requisitionId: row.requisition_id ?? undefined,
      supplierId: row.supplier_id,
      state: row.state,
      totalAmount: row.total_amount,
      currencyCode: row.currency_code ?? undefined,
      deliveryAddress: row.delivery_address ?? undefined,
      legalEntityId: row.legal_entity_id ?? undefined,
      projectId: row.project_id ?? undefined,
      wbsId: row.wbs_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function rowToProjectSalesOrder(row: ProjectSalesOrderRow): ProjectSalesOrderProjection {
    return {
      orderId: row.order_id,
      quoteId: row.quote_id ?? undefined,
      customerId: row.customer_id,
      state: row.state,
      currencyCode: row.currency_code,
      totalAmount: row.total_amount,
      legalEntityId: row.legal_entity_id ?? undefined,
      projectId: row.project_id ?? undefined,
      wbsId: row.wbs_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

export interface CreateProjectFinishedItemInput {
  projectId: string;
  skuId: string;
  organizationId: string;
  quantity: number;
  /** If omitted, unit cost is derived from total WIP cost / quantity */
  unitCost?: number;
}

export function createProjectFinishedItem(input: CreateProjectFinishedItemInput, actor?: EventActor): FinishedItemProjection {
  const project = getProjectRow(input.projectId);

  if (project.status !== "Active") {
    throw new HttpError(400, "invalid_state", "Finished items can only be created for an Active project");
  }

  const wip = db
    .prepare("SELECT * FROM proj_wip WHERE project_id = ? AND status = 'Open'")
    .get(input.projectId) as ProjectWIPRow | undefined;

  if (!wip) {
    throw new HttpError(409, "wip_not_found", "No open WIP record found for this project");
  }

  const totalWipCost = roundMoney(wip.wip_total_balance);
  const unitCost = input.unitCost !== undefined ? input.unitCost : roundMoney(totalWipCost / input.quantity);

  // Create a receipt movement to put the FG into stock
  const movement = postInventoryMovement({
    skuId: input.skuId,
    organizationId: input.organizationId,
    movementType: "receipt",
    quantity: input.quantity,
    unitCost,
    referenceType: "project_finished_item",
    referenceId: input.projectId,
    isProjectFinishedGood: true,
  }, actor);

  const finishedItemId = newId("FGI");
  const ts = now();

  db.prepare(
    `INSERT INTO proj_finished_item(finished_item_id, project_id, wip_id, sku_id, organization_id, quantity, unit_cost, total_wip_cost, movement_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(finishedItemId, input.projectId, wip.wip_id, input.skuId, input.organizationId, input.quantity, unitCost, totalWipCost, movement.movement_id, ts);

  const payload: EventPayload_FinishedItemCreated = {
    finishedItemId,
    projectId: input.projectId,
    skuId: input.skuId,
    organizationId: input.organizationId,
    quantity: input.quantity,
    unitCost,
    totalWipCost,
  };

  appendEvent({
    entityId: input.projectId,
    entityType: "project",
    eventType: "proj.finished_item.created",
    version: 1,
    governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "proj_finished_item_created" },
    payload: payload as unknown as Record<string, unknown>,
    actor,
  });

  const row = db.prepare("SELECT * FROM proj_finished_item WHERE finished_item_id = ?").get(finishedItemId) as FinishedItemRow;
  return rowToFinishedItem(row);
}

export function listProjectFinishedItems(projectId: string): FinishedItemProjection[] {
  const rows = db
    .prepare("SELECT * FROM proj_finished_item WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as FinishedItemRow[];
  return rows.map(rowToFinishedItem);
}

interface ProcurementComponentDemandRow {
  assignment_id: string;
  bom_id: string;
  organization_id: string;
  component_sku_id: string;
  quantity_uom: string;
  quantity_planned: number;
  component_quantity: number;
  scrap_percentage: number;
  standard_cost: number;
}

interface OnHandQuantityRow {
  quantity_on_hand: number;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function getProjectProcurementPreview(projectId: string): ProjectProcurementPreview {
  getProjectRow(projectId);

  const demandRows = db.prepare(
    `SELECT
       a.assignment_id,
       a.bom_id,
       h.organization_id,
       c.component_sku_id,
       c.quantity_uom,
       a.quantity_planned,
       c.quantity AS component_quantity,
       COALESCE(c.scrap_percentage, 0) AS scrap_percentage,
       COALESCE(c.standard_cost, 0) AS standard_cost
     FROM proj_bom_assignment a
     JOIN inv_bom_header h ON h.bom_id = a.bom_id
     JOIN inv_bom_component c ON c.bom_id = a.bom_id
     WHERE a.project_id = ?
       AND a.status = 'Active'
       AND c.component_type = 'Material'
       AND c.component_sku_id IS NOT NULL
       AND COALESCE(c.is_phantom, 0) = 0
     ORDER BY c.component_sku_id ASC, a.bom_id ASC, a.assignment_id ASC`
  ).all(projectId) as ProcurementComponentDemandRow[];

  if (demandRows.length === 0) {
    return {
      projectId,
      generatedAt: now(),
      lineCount: 0,
      shortageLineCount: 0,
      totalRequiredQuantity: 0,
      totalShortageQuantity: 0,
      lines: [],
    };
  }

  const demandMap = new Map<string, {
    skuId: string;
    organizationId: string;
    quantityUom: string;
    requiredQuantity: number;
    weightedCostNumerator: number;
    weightedCostDenominator: number;
    sourceBomIds: Set<string>;
    sourceAssignmentIds: Set<string>;
  }>();

  for (const row of demandRows) {
    const requiredRaw = row.quantity_planned * row.component_quantity * (1 + row.scrap_percentage / 100);
    const requiredQuantity = roundQuantity(requiredRaw);
    if (requiredQuantity <= 0) {
      continue;
    }

    const key = `${row.component_sku_id}|${row.organization_id}|${row.quantity_uom}`;
    const existing = demandMap.get(key);

    if (existing) {
      existing.requiredQuantity = roundQuantity(existing.requiredQuantity + requiredQuantity);
      if (row.standard_cost > 0) {
        existing.weightedCostNumerator = roundMoney(existing.weightedCostNumerator + requiredQuantity * row.standard_cost);
        existing.weightedCostDenominator = roundQuantity(existing.weightedCostDenominator + requiredQuantity);
      }
      existing.sourceBomIds.add(row.bom_id);
      existing.sourceAssignmentIds.add(row.assignment_id);
      continue;
    }

    demandMap.set(key, {
      skuId: row.component_sku_id,
      organizationId: row.organization_id,
      quantityUom: row.quantity_uom,
      requiredQuantity,
      weightedCostNumerator: row.standard_cost > 0 ? roundMoney(requiredQuantity * row.standard_cost) : 0,
      weightedCostDenominator: row.standard_cost > 0 ? requiredQuantity : 0,
      sourceBomIds: new Set([row.bom_id]),
      sourceAssignmentIds: new Set([row.assignment_id]),
    });
  }

  const onHandQuery = db.prepare(
    `SELECT COALESCE(SUM(quantity_on_hand), 0) AS quantity_on_hand
     FROM inv_on_hand
     WHERE sku_id = ? AND organization_id = ?`
  );

  const lines: ProjectProcurementPreviewLine[] = [];

  for (const demand of demandMap.values()) {
    const onHandRow = onHandQuery.get(demand.skuId, demand.organizationId) as OnHandQuantityRow | undefined;
    const onHandQuantity = roundQuantity(onHandRow?.quantity_on_hand ?? 0);
    const shortageQuantity = roundQuantity(Math.max(demand.requiredQuantity - onHandQuantity, 0));
    const suggestedUnitPrice =
      demand.weightedCostDenominator > 0
        ? roundMoney(demand.weightedCostNumerator / demand.weightedCostDenominator)
        : 0;

    lines.push({
      skuId: demand.skuId,
      organizationId: demand.organizationId,
      quantityUom: demand.quantityUom,
      requiredQuantity: demand.requiredQuantity,
      onHandQuantity,
      shortageQuantity,
      suggestedUnitPrice,
      sourceBomIds: Array.from(demand.sourceBomIds),
      sourceAssignmentIds: Array.from(demand.sourceAssignmentIds),
    });
  }

  lines.sort((a, b) => {
    if (b.shortageQuantity !== a.shortageQuantity) {
      return b.shortageQuantity - a.shortageQuantity;
    }
    return a.skuId.localeCompare(b.skuId);
  });

  const totalRequiredQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.requiredQuantity, 0));
  const totalShortageQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.shortageQuantity, 0));
  const shortageLineCount = lines.filter((line) => line.shortageQuantity > 0).length;

  return {
    projectId,
    generatedAt: now(),
    lineCount: lines.length,
    shortageLineCount,
    totalRequiredQuantity,
    totalShortageQuantity,
    lines,
  };
}

export function generateProjectRequisitionLinesFromPreview(
  projectId: string,
  input: GenerateProjectRequisitionLinesInput = {},
  actor?: EventActor
): ProjectRequisitionGenerationResult {
  const preview = getProjectProcurementPreview(projectId);
  const shortageLines = preview.lines.filter((line) => line.shortageQuantity > 0);

  if (shortageLines.length === 0) {
    throw new HttpError(409, "no_shortage", "No procurement shortages were found for this project");
  }

  const project = getProjectRow(projectId);

  let requisitionId = input.requisitionId;
  if (requisitionId) {
    const existing = getRequisitionById(requisitionId) as {
      requisition_id: string;
      state: string;
      project_id?: string | null;
    };

    if ((existing.project_id ?? null) !== projectId) {
      throw new HttpError(400, "invalid_request", "Provided requisitionId is not linked to this project");
    }

    if (existing.state !== "Draft") {
      throw new HttpError(409, "invalid_state", "Requisition must be in Draft state to add generated lines");
    }
  } else {
    const created = createRequisition(
      {
        requester: input.requester ?? actor?.id ?? "principal.system",
        department: input.department ?? "Project Procurement",
        currencyCode: input.currencyCode ?? "USD",
        neededByDate: input.neededByDate,
        legalEntityId: input.legalEntityId,
        projectId: project.project_id,
        wbsId: project.wbs_id ?? undefined,
      },
      actor
    ) as { requisition_id: string };

    requisitionId = created.requisition_id;
  }

  let generatedLineCount = 0;

  for (const line of shortageLines) {
    addRequisitionLine(
      {
        requisitionId,
        description: `Auto-generated from project ${projectId} BOM demand for SKU ${line.skuId}`,
        quantity: line.shortageQuantity,
        unitPrice: line.suggestedUnitPrice,
      },
      actor
    );
    generatedLineCount += 1;
  }

  return {
    projectId,
    requisitionId,
    generatedLineCount,
    skippedLineCount: preview.lineCount - generatedLineCount,
    totalShortageQuantity: preview.totalShortageQuantity,
    preview,
  };
}

export function listProjectRequisitions(projectId: string): ProjectRequisitionProjection[] {
  const rows = db
    .prepare("SELECT * FROM p2p_requisition WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as ProjectRequisitionRow[];
  return rows.map(rowToProjectRequisition);
}

export function listProjectPurchaseOrders(projectId: string): ProjectPurchaseOrderProjection[] {
  const rows = db
    .prepare("SELECT * FROM p2p_purchase_order WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as ProjectPurchaseOrderRow[];
  return rows.map(rowToProjectPurchaseOrder);
}

export function listProjectSalesOrders(projectId: string): ProjectSalesOrderProjection[] {
  const rows = db
    .prepare("SELECT * FROM o2c_sales_order WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as ProjectSalesOrderRow[];
  return rows.map(rowToProjectSalesOrder);
}
