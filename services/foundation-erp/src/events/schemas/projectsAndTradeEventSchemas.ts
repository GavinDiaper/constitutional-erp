/**
 * Event Schema Interfaces for Projects, BOM, Internal Trade, H2R Labor Costing
 * 
 * These interfaces define the canonical payloads for all v1 events.
 * All events are immutable, replayable, and idempotent.
 * 
 * Generated from: docs/PHASE0_SCHEMA_CONTRACTS.md
 * Phase: 0 (Schema Contracts)
 * Date: 2026-04-18
 */

// ============================================================================
// CLIENT EVENT PAYLOADS (input to commands; generate eventId + governance context)
// ============================================================================

/**
 * Project Lifecycle Events
 */

export interface EventPayload_ProjectCreated {
  projectId: string;
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
  projectManagerId: string;
  organizationId: string;
}

export interface EventPayload_ProjectActivated {
  projectId: string;
  activatedAt: string;
}

export interface EventPayload_ProjectHeld {
  projectId: string;
  heldAt: string;
  holdReason?: string;
}

export interface EventPayload_ProjectResumed {
  projectId: string;
  resumedAt: string;
}

export interface EventPayload_ProjectCompleted {
  projectId: string;
  completionType: "FG_Conversion" | "Expense_Close";
  completedAt: string;
  finalWIPMaterialBalance: number;
  finalWIPLaborBalance: number;
  finalWIPTotalBalance: number;
  closeAccountId?: string;
}

export interface EventPayload_ProjectCancelled {
  projectId: string;
  cancellationReason: string;
  cancelledAt: string;
}

/**
 * Project WIP Events
 */

export interface EventPayload_WIPCreated {
  wipId: string;
  projectId: string;
  organizationId: string;
}

export interface EventPayload_WIPMaterialPosted {
  wipId: string;
  projectId: string;
  inventoryIssueEventId: string;
  skuId: string;
  quantity: number;
  quantityUom: string;
  unitCost: number;
  totalCost: number;
  costElement: string;
  scrapQuantity?: number;
  postedAt: string;
}

export interface EventPayload_WIPLaborPosted {
  wipId: string;
  projectId: string;
  timesheetLineId: string;
  employeeId: string;
  hours: number;
  hourlyRate: number;
  totalCost: number;
  costElement: string;
  postedAt: string;
}

export interface EventPayload_WIPClosed {
  wipId: string;
  projectId: string;
  closureType: "FG_Conversion" | "Expense_Close";
  finalMaterialBalance: number;
  finalLaborBalance: number;
  finalTotalBalance: number;
  closedAt: string;
}

/**
 * Inventory Events with Project Context (Extended Payloads)
 */

export interface EventPayload_InventoryIssuedPosted {
  issueId: string;
  itemId: string;
  quantity: number;
  quantityUom: string;
  unitCost: number;
  totalCost: number;
  organizationId: string;
  // NEW PROJECT CONTEXT:
  projectId?: string;
  projectWipId?: string;
  bomId?: string;
  bomComponentFlag?: boolean;
  isBomMaterialIssue?: boolean;
}

export interface EventPayload_InventoryReceiptPosted {
  receiptId: string;
  itemId: string;
  quantity: number;
  quantityUom: string;
  receivedCost: number;
  totalCost: number;
  organizationId: string;
  // NEW PROJECT CONTEXT:
  projectId?: string;
  projectWipId?: string;
  isProjectFinishedGood?: boolean;
  aggregatedWIPCost?: number;
}

/**
 * BOM Events
 */

export interface EventPayload_BOMCreated {
  bomId: string;
  parentSkuId: string;
  revision: string;
  effectiveFrom: string;
  projectEligible: boolean;
  costingProfile: string;
}

export interface EventPayload_BOMComponentAdded {
  bomId: string;
  componentId: string;
  componentSkuId: string;
  sequenceNumber: number;
  quantityPer: number;
  quantityUom: string;
  scrapPercentage: number;
  componentType: "MATERIAL" | "LABOR_COST" | "OTHER_COST";
  costElement?: string;
}

/**
 * Cost Element Events
 */

export interface EventPayload_CostElementCreated {
  costElementId: string;
  name: string;
  type: "MATERIAL" | "LABOR" | "OVERHEAD";
  costClass: "Direct" | "Indirect";
  glAccountId: string;
  glAccountAlternate?: string;
  taxCode?: string;
}

/**
 * BOM Assignment Events
 */

export interface EventPayload_BomAssigned {
  assignmentId: string;
  projectId: string;
  wbsId?: string;
  bomId: string;
  quantityPlanned: number;
}

export interface BomAssignmentProjection {
  assignmentId: string;
  projectId: string;
  wbsId?: string;
  bomId: string;
  quantityPlanned: number;
  status: "Active" | "Cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface EventPayload_LaborCosted {
  entryId: string;
  projectId: string;
  wbsId?: string;
  resourceId: string;
  hours: number;
  rate: number;
  totalCost: number;
  costElementId?: string;
}

export interface LaborEntryProjection {
  entryId: string;
  projectId: string;
  wipId: string;
  wbsId?: string;
  resourceId: string;
  hours: number;
  rate: number;
  totalCost: number;
  costElementId?: string;
  postedAt: string;
  createdAt: string;
}

export interface EventPayload_FinishedItemCreated {
  finishedItemId: string;
  projectId: string;
  skuId: string;
  organizationId: string;
  quantity: number;
  unitCost: number;
  totalWipCost: number;
}

export interface FinishedItemProjection {
  finishedItemId: string;
  projectId: string;
  wipId: string;
  skuId: string;
  organizationId: string;
  quantity: number;
  unitCost: number;
  totalWipCost: number;
  movementId?: string;
  createdAt: string;
}

/**
 * Internal Trade Events
 */

export interface InternalTradeItem {
  tradeLineId: string;
  skuId: string;
  quantity: number;
  quantityUom: string;
  unitPrice: number;
  totalPrice: number;
  costElement: string;
}

export interface EventPayload_InternalPOCreated {
  tradeId: string;
  projectId: string;
  supplierOrgId: string;
  customerOrgId: string;
  items: InternalTradeItem[];
  totalAmount: number;
  createdAt: string;
}

export interface EventPayload_InternalSOCreated {
  tradeId: string;
  projectId: string;
  supplierOrgId: string;
  customerOrgId: string;
  items: InternalTradeItem[];
  totalAmount: number;
  linkedPoId: string;
}

export interface EventPayload_InternalIssuePosted {
  tradeLineId: string;
  projectId: string;
  skuId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sourceInventoryIssueEventId: string;
  costElement: string;
}

export interface EventPayload_InternalReceiptPosted {
  tradeLineId: string;
  projectId: string;
  skuId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sourceInventoryReceiptEventId: string;
  costElement: string;
}

/**
 * H2R Labor Events
 */

export interface EventPayload_TimesheetCreated {
  timesheetId: string;
  employeeId: string;
  timePeriodStart: string;
  timePeriodEnd: string;
}

export interface EventPayload_TimesheetLineAdded {
  timesheetId: string;
  lineId: string;
  workDate: string;
  hours: number;
  projectId?: string;
  costElement: string;
  description?: string;
}

export interface EventPayload_TimesheetSubmitted {
  timesheetId: string;
  employeeId: string;
  timePeriodStart: string;
  timePeriodEnd: string;
  totalHours: number;
  totalCost: number;
  lineCount: number;
  submittedAt: string;
}

export interface ApprovedTimelineItem {
  lineId: string;
  workDate: string;
  hours: number;
  rate: number;
  cost: number;
  projectId?: string;
  costElement: string;
}

export interface EventPayload_TimesheetApproved {
  timesheetId: string;
  employeeId: string;
  approvedBy: string;
  approvedAt: string;
  totalHours: number;
  totalCost: number;
  approvedLines: ApprovedTimelineItem[];
}

export interface EventPayload_TimesheetRejected {
  timesheetId: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectionReason: string;
}

export interface EventPayload_LaborRateCreated {
  rateCardId: string;
  employeeId: string;
  effectiveFrom: string;
  rate: number;
  rateType: "Hourly" | "Salaried" | "Project";
  defaultCostElement: string;
}

// ============================================================================
// PROJECTION STATE SCHEMAS (read model; generated from events)
// ============================================================================

export interface ProjectProjection {
  projectId: string;
  name: string;
  description?: string;
  customerId?: string;
  contractId?: string;
  wbsId?: string;
  projectType: "Internal" | "Capital" | "Billable" | "Service";
  status: "Draft" | "Active" | "OnHold" | "Completed" | "Cancelled";
  budgetAmount: number;
  baselineBudgetAmount: number;
  actualCostAmount: number;
  revenueAmount?: number;
  defaultWIPAccountId: string;
  defaultCloseAccountId: string;
  startDate: string;
  endDate?: string;
  projectManagerId: string;
  organizationId: string;
  createdAt: string;
  createdBy: string;
  version: number;
  lastEventAt: string;
  wipMaterialBalance: number;
  wipLaborBalance: number;
  wipTotalBalance: number;
  closedFGCost?: number;
  closedExpenseCost?: number;
}

export interface ProjectWIPProjection {
  wipId: string;
  projectId: string;
  wipMaterialBalance: number;
  wipLaborBalance: number;
  wipOverheadBalance: number;
  wipTotalBalance: number;
  materialLineCount: number;
  laborLineCount: number;
  status: "Open" | "Closed";
  closedAt?: string;
  closeCompletionType?: "FG_Conversion" | "Expense_Close";
  lastMaterialPostedAt?: string;
  lastLaborPostedAt?: string;
  organizationId: string;
  createdAt: string;
  version: number;
}

export interface BOMHeaderProjection {
  bomId: string;
  parentSkuId: string;
  revision: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: "Draft" | "Active" | "Superseded";
  projectEligible: boolean;
  costingProfile: string;
  description?: string;
  componentCount: number;
  createdAt: string;
  createdBy: string;
  version: number;
  organizationId: string;
}

export interface BOMComponentProjection {
  componentId: string;
  bomId: string;
  componentSkuId: string;
  sequenceNumber: number;
  quantityPer: number;
  quantityUom: string;
  scrapPercentage: number;
  componentType: "MATERIAL" | "LABOR_COST" | "OTHER_COST";
  costElement?: string;
  standardCost?: number;
  createdAt: string;
  createdBy: string;
  version: number;
}

export interface CostElementProjection {
  costElementId: string;
  name: string;
  type: "MATERIAL" | "LABOR" | "OVERHEAD";
  costClass: "Direct" | "Indirect";
  glAccountId: string;
  glAccountAlternate?: string;
  taxCode?: string;
  allocationMethod?: "None" | "Percent" | "Per_Hour" | "Per_Unit";
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  version: number;
}

export interface H2RLaborRateCardProjection {
  rateCardId: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  rate: number;
  rateType: "Hourly" | "Salaried" | "Project";
  defaultCostElement: string;
  approvalStatus: "Draft" | "Approved";
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  createdBy: string;
  version: number;
}

export interface H2RTimesheetLineProjection {
  lineId: string;
  dayOfWeek: string;
  workDate: string;
  hours: number;
  projectId?: string;
  costElement: string;
  description?: string;
  approverComment?: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
}

export interface H2RTimesheetProjection {
  timesheetId: string;
  employeeId: string;
  timePeriodStart: string;
  timePeriodEnd: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
  totalHours: number;
  totalCost: number;
  lineCount: number;
  lines: H2RTimesheetLineProjection[];
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  postedAt?: string;
  postedBy?: string;
  createdAt: string;
  version: number;
  organizationId: string;
}

export interface InternalTradeLineProjection {
  tradeLineId: string;
  skuId: string;
  quantity: number;
  quantityUom: string;
  unitPrice: number;
  totalPrice: number;
  costElement: string;
  status: "Pending" | "Issued" | "Received" | "Invoiced" | "Settled";
}

export interface InternalTradeProjection {
  tradeId: string;
  type: "PO" | "SO";
  supplierOrgId: string;
  customerOrgId: string;
  projectId?: string;
  items: InternalTradeLineProjection[];
  totalAmount: number;
  status: "Draft" | "Released" | "Issued" | "Received" | "Closed" | "Cancelled";
  issuedAt?: string;
  receivedAt?: string;
  settledAt?: string;
  createdAt: string;
  createdBy: string;
  version: number;
}

// ============================================================================
// UNION TYPES FOR DISPATCH & HANDLERS
// ============================================================================

export type ProjectEventPayload =
  | EventPayload_ProjectCreated
  | EventPayload_ProjectActivated
  | EventPayload_ProjectHeld
  | EventPayload_ProjectResumed
  | EventPayload_ProjectCompleted
  | EventPayload_ProjectCancelled;

export type ProjectWIPEventPayload =
  | EventPayload_WIPCreated
  | EventPayload_WIPMaterialPosted
  | EventPayload_WIPLaborPosted
  | EventPayload_WIPClosed;

export type BOMEventPayload =
  | EventPayload_BOMCreated
  | EventPayload_BOMComponentAdded;

export type InternalTradeEventPayload =
  | EventPayload_InternalPOCreated
  | EventPayload_InternalSOCreated
  | EventPayload_InternalIssuePosted
  | EventPayload_InternalReceiptPosted;

export type H2RLaborEventPayload =
  | EventPayload_TimesheetCreated
  | EventPayload_TimesheetLineAdded
  | EventPayload_TimesheetSubmitted
  | EventPayload_TimesheetApproved
  | EventPayload_TimesheetRejected
  | EventPayload_LaborRateCreated;

export type AllEventPayload =
  | ProjectEventPayload
  | ProjectWIPEventPayload
  | BOMEventPayload
  | EventPayload_InventoryIssuedPosted
  | EventPayload_InventoryReceiptPosted
  | EventPayload_CostElementCreated
  | InternalTradeEventPayload
  | H2RLaborEventPayload;

// ============================================================================
// IDEMPOTENCY & CAUSATION TRACKING
// ============================================================================

/**
 * Command Idempotency Key
 * Generated by client; used to deduplicate retries.
 * Server stores mapping: (commandType, entityId, idempotencyKey) -> eventId
 */
export interface IdempotencyKey {
  commandType: string;
  entityId: string;
  key: string; // UUID
}

/**
 * Event Correlation
 * Every event carries causation for tracing and replay deduplication.
 */
export interface EventCorrelation {
  correlationId: string; // Links related events in a transaction
  causationId?: string; // Parent event ID that triggered this event
}

/**
 * GL Posting Idempotency
 * Before posting a journal line, check if sourceEventId exists.
 * If yes, skip or reconcile.
 */
export interface GLPostingIdempotency {
  journalLineId: string;
  sourceEventId: string; // Event ID that triggered posting
  glAccount: string;
  debitAmount: number;
  creditAmount: number;
  postedAt: string;
}
