import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
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

  try {
    transaction(() => {
      // Insert project row
      db.prepare(
        `INSERT INTO proj_project(
          project_id, name, description, customer_id, contract_id, wbs_id, project_type, status,
          budget_amount, actual_cost_amount, revenue_amount,
          default_wip_account_id, default_close_account_id,
          start_date, end_date, project_manager_id, organization_id,
          created_at, created_by, version, last_event_at,
          wip_material_balance, wip_labor_balance, wip_total_balance,
          closed_fg_cost, closed_expense_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        0, // actual_cost_amount starts at 0
        null, // revenue_amount
        input.defaultWIPAccountId,
        input.defaultCloseAccountId,
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
        defaultWIPAccountId: input.defaultWIPAccountId,
        defaultCloseAccountId: input.defaultCloseAccountId,
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
  return db
    .prepare(
      `SELECT * FROM proj_project ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
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
