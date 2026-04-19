import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";
import { postInventoryMovement } from "../inv/inventoryService";
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
           version            = version + 1,
           last_event_at      = ?
       WHERE project_id = ?`
    ).run(totalCost, totalCost, ts, input.projectId);
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
