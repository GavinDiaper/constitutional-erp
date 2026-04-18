/**
 * Domain Command Interfaces for Projects, BOM, Internal Trade, H2R Labor
 * 
 * All commands include idempotency context (idempotencyKey) and governance (actor + riskLevel).
 * Commands are validated, then produce one or more events.
 * 
 * Generated from: docs/PHASE0_SCHEMA_CONTRACTS.md
 * Phase: 0 (Schema Contracts)
 * Date: 2026-04-18
 */

import { EventActor, GovernanceContext } from "../../events/eventStore";

// ============================================================================
// GOVERNANCE & COMMAND CONTEXT (Common to all commands)
// ============================================================================

/**
 * Command Context
 * Metadata passed with every command for idempotency, causation, and governance.
 */
export interface CommandContext {
  idempotencyKey: string; // UUID; client-generated; deduplicates retries
  actor: EventActor; // (user | system) + authority tier
  governance?: GovernanceContext; // Risk level, required tier, governance tag
  correlationId?: string; // Optional: links related commands in a transaction
  causationId?: string; // Optional: parent event that triggered this command
  tenantId?: string; // Organization context
}

/**
 * Command Validation Result
 * Returned by command guards before execution.
 */
export interface CommandValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================================
// PROJECT COMMANDS
// ============================================================================

export interface CreateProjectCmd {
  projectId?: string; // If not provided, server generates proj-{UUID}
  name: string;
  description?: string;
  projectType: "Internal" | "Capital" | "Billable" | "Service";
  customerId?: string;
  contractId?: string;
  budgetAmount: number;
  defaultWIPAccountId: string; // GL account ID for WIP accumulation
  defaultCloseAccountId: string; // GL account ID for expense-only or capital close
  startDate: string; // ISO date
  endDate?: string; // ISO date; optional
  projectManagerId: string; // H2R employee ID
  organizationId: string;
  context: CommandContext;
}

export interface ActivateProjectCmd {
  projectId: string;
  context: CommandContext;
}

export interface HoldProjectCmd {
  projectId: string;
  holdReason?: string;
  context: CommandContext;
}

export interface ResumeProjectCmd {
  projectId: string;
  context: CommandContext;
}

/**
 * CompleteProjectCmd
 * Guards:
 *   - Project status = Active or OnHold
 *   - No outstanding required transactions (e.g., pending timesheet approvals, open POs)
 *   - All prior GL postings reconciled
 *   - completionType specified: "FG_Conversion" or "Expense_Close"
 *
 * Execution:
 *   - Emits proj.project_completed event
 *   - Event-processor consumes, emits proj.wip_closed event
 *   - Event-processor triggers SLA posting (WIP → Finished Good or Expense Account)
 */
export interface CompleteProjectCmd {
  projectId: string;
  completionType: "FG_Conversion" | "Expense_Close";
  closeAccountId?: string; // Required if completionType = "Expense_Close"
  context: CommandContext;
}

export interface CancelProjectCmd {
  projectId: string;
  cancellationReason: string;
  forceCancel?: boolean; // If true, override guard that checks for GL-posted transactions
  context: CommandContext;
}

// ============================================================================
// BOM COMMANDS
// ============================================================================

export interface CreateBOMCmd {
  bomId?: string; // If not provided, server generates bom-{UUID}
  parentSkuId: string; // Incoming: references existing SKU in inventory
  revision: string; // e.g., "1.0", "A", "Rev1"
  effectiveFrom: string; // ISO date
  effectiveTo?: string; // ISO date or null (permanent)
  projectEligible: boolean; // Can this BOM be used in projects?
  costingProfile: string; // GL posting profile (e.g., "std_manufactured", "std_internal")
  description?: string;
  organizationId: string;
  context: CommandContext;
}

export interface AddBOMComponentCmd {
  bomId: string; // References existing BOM
  componentId?: string; // If not provided, server generates bcomp-{UUID}
  componentSkuId: string; // Incoming: references existing SKU in inventory
  sequenceNumber: number;
  quantityPer: number;
  quantityUom: string; // e.g., "KG", "EA", "L"
  scrapPercentage: number; // 0–100; default 0
  componentType: "MATERIAL" | "LABOR_COST" | "OTHER_COST";
  costElement?: string; // Cost element reference; required if componentType = LABOR_COST or OTHER_COST
  standardCost?: number; // Optional; used for BOM costing preview
  context: CommandContext;
}

// ============================================================================
// COST ELEMENT COMMANDS
// ============================================================================

export interface CreateCostElementCmd {
  costElementId?: string; // If not provided, server generates ce-{UUID}
  name: string;
  type: "MATERIAL" | "LABOR" | "OVERHEAD";
  costClass: "Direct" | "Indirect";
  glAccountId: string; // Primary GL account
  glAccountAlternate?: string; // Alternate GL account
  taxCode?: string; // For internal trade
  allocationMethod?: "None" | "Percent" | "Per_Hour" | "Per_Unit"; // For future use (v2+)
  organizationId: string;
  context: CommandContext;
}

// ============================================================================
// INTERNAL TRADE COMMANDS
// ============================================================================

export interface InternalTradeItemCmd {
  skuId: string;
  quantity: number;
  quantityUom: string;
  unitPrice: number; // Transfer price
  costElement: string;
}

/**
 * CreateInternalPOCmd
 * Creates an internal purchase order: Project org → Inventory org
 * Guards:
 *   - Project exists and status = Active
 *   - All items reference valid SKUs and cost elements
 *   - Transfer prices are non-negative
 */
export interface CreateInternalPOCmd {
  tradeId?: string; // If not provided, server generates itr-{UUID}
  projectId: string; // Incoming: project must exist
  supplierOrgId: string; // Inventory org
  customerOrgId?: string; // Derived from project org if not provided
  items: InternalTradeItemCmd[];
  context: CommandContext;
}

/**
 * CreateInternalSOCmd
 * Creates an internal sales order: Inventory org → Project org
 * Mirrors the PO; generated by event-processor on PO creation.
 * Guards: Same as PO
 */
export interface CreateInternalSOCmd {
  tradeId?: string;
  projectId: string;
  supplierOrgId: string;
  customerOrgId?: string;
  items: InternalTradeItemCmd[];
  linkedPoId: string; // FK to PO
  context: CommandContext;
}

// ============================================================================
// H2R TIMESHEET COMMANDS
// ============================================================================

export interface CreateTimesheetCmd {
  timesheetId?: string; // If not provided, server generates ts-{UUID}
  employeeId: string; // References H2R employee
  timePeriodStart: string; // ISO date; typically Monday of week
  timePeriodEnd: string; // ISO date; typically Sunday of week
  organizationId: string;
  context: CommandContext;
}

export interface TimesheetLineItemCmd {
  lineId?: string; // If not provided, server generates line-{UUID}
  dayOfWeek: string; // "Monday" | "Tuesday" | … | "Sunday"
  workDate: string; // ISO date
  hours: number;
  projectId?: string; // Required if billable to project; null if overhead/indirect
  description?: string;
}

/**
 * AddTimesheetLineCmd
 * Adds a line to a draft timesheet.
 * Guards:
 *   - Timesheet exists and status = Draft
 *   - If projectId supplied, project must exist and be Active
 *   - hours >= 0 and <= 24
 */
export interface AddTimesheetLineCmd {
  timesheetId: string;
  line: TimesheetLineItemCmd;
  context: CommandContext;
}

/**
 * SubmitTimesheetCmd
 * Moves timesheet from Draft → Submitted.
 * Guards:
 *   - Timesheet status = Draft
 *   - At least one line exists
 *   - Total hours > 0
 *   - All project references valid
 */
export interface SubmitTimesheetCmd {
  timesheetId: string;
  context: CommandContext;
}

/**
 * ApproveTimesheetCmd
 * Governance gate. Moves timesheet from Submitted → Approved.
 * Triggers labor cost event generation (Phase 2: event-processor consumes and emits proj.wip_labor_posted).
 * 
 * Guards:
 *   - Timesheet status = Submitted
 *   - Actor authority tier >= threshold (default Tier 2)
 *   - All lines validated (rates, project allocations, cost elements resolved)
 *
 * On approval, all lines generate labor cost events:
 *   - If projectId: emit proj.wip_labor_posted event
 *   - If no projectId: labor cost goes to configured overhead/indirect account (Phase 2 logic)
 */
export interface ApproveTimesheetCmd {
  timesheetId: string;
  context: CommandContext; // Must include actor with Tier 2+
  approverNotes?: string;
}

/**
 * RejectTimesheetCmd
 * Moves timesheet from Submitted → Rejected.
 * Guards:
 *   - Timesheet status = Submitted
 *   - Actor authority tier >= threshold (default Tier 1)
 */
export interface RejectTimesheetCmd {
  timesheetId: string;
  rejectionReason: string;
  context: CommandContext;
}

// ============================================================================
// LABOR RATE COMMANDS
// ============================================================================

export interface CreateLaborRateCardCmd {
  rateCardId?: string; // If not provided, server generates rc-{UUID}
  employeeId: string;
  effectiveFrom: string; // ISO date
  effectiveTo?: string; // ISO date; optional (null = permanent/until superseded)
  rate: number; // $ per hour
  rateType: "Hourly" | "Salaried" | "Project";
  defaultCostElement: string; // Cost element for timesheet postings
  context: CommandContext;
}

/**
 * ApproveLaborRateCardCmd
 * Governance gate. Moves rate from Draft → Approved.
 * Guards:
 *   - Rate card status = Draft
 *   - Actor authority tier >= Tier 2 (compensation is sensitive)
 *   - Rate >= 0
 *   - Cost element exists
 */
export interface ApproveLaborRateCardCmd {
  rateCardId: string;
  context: CommandContext; // Must include actor with Tier 2+
}

// ============================================================================
// COMMAND HANDLER SIGNATURES (FOR IMPLEMENTATION)
// ============================================================================

/**
 * Generic Command Handler Type
 * Each domain implements handlers for its command types.
 * Return value: event ID (idempotency key) for client confirmation.
 */
export type CommandHandler<TCmd extends { context: CommandContext }> = (
  command: TCmd
) => Promise<{
  eventId: string; // Returned for client idempotency verification
  causationId?: string;
  correlationId?: string;
  warnings?: string[];
}>;

/**
 * Command Validation Handler
 * Returns validation errors before command is persisted.
 */
export type CommandValidator<TCmd extends { context: CommandContext }> = (
  command: TCmd
) => Promise<CommandValidationResult>;

// ============================================================================
// PROJECTION COMMAND EXECUTION STATE (FOR AUDIT/DEBUGGING)
// ============================================================================

/**
 * Tracks a command from receipt through successful event generation.
 * Used for debugging, replay, and SoD auditing.
 */
export interface CommandExecutionAudit {
  commandId: string; // Unique per command invocation
  commandType: string;
  entityId: string;
  idempotencyKey: string;
  actor: EventActor;
  status: "Pending" | "Validated" | "Posted" | "Failed" | "Rejected";
  validationResult?: CommandValidationResult;
  generatedEventIds: string[]; // All events generated by this command
  executedAt: string; // ISO timestamp
  executionDurationMs: number;
  errorMessage?: string;
  governanceContext?: GovernanceContext;
}

// ============================================================================
// COMMAND DISPATCH & ROUTING (FOR IMPLEMENTATION)
// ============================================================================

/**
 * Command Router
 * Routes incoming commands to appropriate domain handlers.
 * Pattern: switch(command.type) or map-based dispatch.
 */
export interface ICommandDispatcher {
  dispatch<TCmd extends { context: CommandContext }>(
    command: TCmd
  ): Promise<{ eventId: string }>;

  validate<TCmd extends { context: CommandContext }>(
    command: TCmd
  ): Promise<CommandValidationResult>;
}

/**
 * Command Summary for API Response
 * Lightweight response sent to client after command accepted.
 */
export interface CommandResponse {
  success: boolean;
  eventId: string; // For idempotency verification
  idempotencyKey: string;
  correlationId?: string;
  message?: string;
  errors?: string[];
  warnings?: string[];
  executedAt: string;
}
