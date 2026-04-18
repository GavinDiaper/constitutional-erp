# Phase 0: Canonical Schema Contracts for Projects + Inventory + H2R Labor

**Status**: Draft for review and sign-off  
**Date**: 2026-04-18  
**Scope**: Event schemas, domain entities, and idempotency rules for v1 implementation

---

## 1. Core Principles

### 1.1 Event-Sourced Design
- All state mutations are recorded as immutable events.
- Events carry full context (actor, governance, causation) for audit and replay.
- Events are idempotent: replaying the same event twice produces the same state as playing it once.

### 1.2 Idempotency Strategy
- **Primary Key**: `eventId` is globally unique and generated at command time.
- **Deduplication Field**: `idempotencyKey` (command correlationId) allows clients to safely retry.
- **Replay Safety**: Projection handlers check for duplicate event IDs; if present, skip processing.
- **Causation Tracking**: `causationId` links events to initiating command/parent event for correlation.

### 1.3 Governance Context
Every high-risk event carries:
- `riskLevel`: `Low` | `Medium` | `High`
- `requiredTier`: Authority tier (1–5) mandatory for posting
- `governanceTag`: Named rule for audit (e.g., "cost_adjustment_requires_approval")
- `actor`: User/system ID and claimed authority tier

---

## 2. Domain Entity Schemas

### 2.1 Project Aggregate

**Entity Type**: `project`

#### State Fields
```typescript
{
  projectId: string;                    // PK: proj-{UUID}
  name: string;
  description?: string;
  customerId?: string;                  // O2C customer ref (optional)
  contractId?: string;                  // P2P contract ref (optional)
  projectType: "Internal" | "Capital" | "Billable" | "Service";
  status: "Draft" | "Active" | "OnHold" | "Completed" | "Cancelled";
  budgetAmount: number;                 // Total project budget
  actualCostAmount: number;             // Accumulated WIP + closed cost (read-only, computed)
  revenueAmount?: number;               // For billable projects (O2C linked)
  defaultWIPAccountId: string;          // GL account for WIP accumulation
  defaultCloseAccountId: string;        // GL account for non-FG close (expense/capital)
  startDate: string;                    // ISO date
  endDate?: string;                     // ISO date; set on completion
  projectManagerId: string;             // HR employee ref
  organizationId: string;               // Org context for segregation
  createdAt: string;                    // ISO timestamp
  createdBy: string;                    // Actor ID
  version: number;                      // Event count for optimistic locking
  lastEventAt: string;                  // Timestamp of last state-mutating event
  wipMaterialBalance: number;           // Current material WIP (read-only projection)
  wipLaborBalance: number;              // Current labor WIP (read-only projection)
  wipTotalBalance: number;              // Material + Labor WIP (read-only projection)
  closedFGCost?: number;                // Sum of finished goods receipts (if FG close)
  closedExpenseCost?: number;           // Sum of expense-only close postings (if expense close)
}
```

#### Allowed Transitions
- Draft → Active (on activate)
- Active → OnHold (on hold)
- OnHold → Active (on resume)
- Active / OnHold → Completed (on complete, guards: no open required transactions)
- * → Cancelled (on cancel, only if no GL posted transactions yet)

---

### 2.2 Project WIP Aggregate

**Entity Type**: `project_wip`

#### State Fields
```typescript
{
  wipId: string;                        // PK: wip-{UUID}
  projectId: string;                    // FK: project.projectId
  wipMaterialBalance: number;           // Accumulated material costs
  wipLaborBalance: number;              // Accumulated labor costs
  wipOverheadBalance: number;           // Reserved for future burden allocation; 0 in v1
  wipTotalBalance: number;              // Material + Labor + Overhead (read-only)
  materialLineCount: number;            // Count of material cost lines posted
  laborLineCount: number;               // Count of labor cost lines posted
  materialsIssuedQty: number;           // Sum of material issue quantities
  laborHoursCisted: number;             // Sum of labor hours posted
  lastMaterialIssueAt?: string;         // ISO timestamp of last material event
  lastLaborChargeAt?: string;           // ISO timestamp of last labor event
  wipStatus: "Open" | "Closed";         // Closed when project is Completed or Cancelled
  closedAt?: string;                    // ISO timestamp of close event
  closedByActor?: string;               // Actor ID who closed WIP
  organizationId: string;               // Org context (must match project)
  createdAt: string;
  version: number;
}
```

---

### 2.3 BOM Header Aggregate

**Entity Type**: `bom_header`

#### State Fields
```typescript
{
  bomId: string;                        // PK: bom-{UUID}
  parentSkuId: string;                  // Parent item (finished good)
  revision: string;                     // BOM revision code (e.g., "A", "B", "1.0")
  effectiveFrom: string;                // ISO date when BOM becomes active
  effectiveTo?: string;                 // ISO date when BOM expires
  status: "Draft" | "Active" | "Superseded";
  projectEligible: boolean;             // Can this BOM be assigned to projects?
  costingProfile: string;               // Posting profile for SLA routing (e.g., "std_manufactured")
  description?: string;
  componentCount: number;               // Count of BOM lines (read-only)
  createdAt: string;
  createdBy: string;
  version: number;
  organizationId: string;
}
```

---

### 2.4 BOM Component Aggregate

**Entity Type**: `bom_component`

#### State Fields
```typescript
{
  componentId: string;                  // PK: bcomp-{UUID}
  bomId: string;                        // FK: bom_header.bomId
  componentSkuId: string;               // The component item (material)
  sequenceNumber: number;               // Position in BOM (1, 2, 3…)
  quantityPer: number;                  // Qty required per parent
  quantityUom: string;                  // UoM for quantity
  scrapPercentage: number;              // Scrap % (default 0; e.g., 5 = 5% scrap)
  componentType: "MATERIAL" | "LABOR_COST" | "OTHER_COST";
  costElement?: string;                 // Cost element ID for labor/overhead components
  standardCost?: number;                // Standard cost per unit (optional; used for planning)
  createdAt: string;
  createdBy: string;
  version: number;
}
```

---

### 2.5 Cost Element Master

**Entity Type**: `cost_element`

#### State Fields
```typescript
{
  costElementId: string;                // PK: ce-{UUID}
  name: string;                         // Human-readable: "Material Direct", "Labor Regular", "Overhead Allocated"
  type: "MATERIAL" | "LABOR" | "OVERHEAD";
  costClass: "Direct" | "Indirect";     // For costing segregation
  glAccountId: string;                  // Primary GL account for posting
  glAccountAlternate?: string;          // Alternate account (e.g., for internal trade)
  taxCode?: string;                     // Tax code for internal trade pricing
  allocationMethod?: "None" | "Percent" | "Per_Hour" | "Per_Unit";  // For future burden allocation
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  version: number;
}
```

---

### 2.6 H2R Labor Rate Card

**Entity Type**: `h2r_labor_rate_card`

#### State Fields
```typescript
{
  rateCardId: string;                   // PK: rc-{UUID}
  employeeId: string;                   // FK: h2r_employee_master.employeeId
  effectiveFrom: string;                // ISO date
  effectiveTo?: string;                 // ISO date; null = current/valid
  rate: number;                         // $ per hour
  rateType: "Hourly" | "Salaried" | "Project";
  defaultCostElement: string;           // Cost element for timesheet postings
  approvalStatus: "Draft" | "Approved";
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  createdBy: string;
  version: number;
}
```

---

### 2.7 H2R Timesheet Aggregate

**Entity Type**: `h2r_timesheet`

#### State Fields
```typescript
{
  timesheetId: string;                  // PK: ts-{UUID}
  employeeId: string;                   // FK: h2r_employee
  timePeriodStart: string;              // ISO date (e.g., 2026-04-01)
  timePeriodEnd: string;                // ISO date (e.g., 2026-04-07)
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
  totalHours: number;                   // Sum of all line hours (read-only)
  totalCost: number;                    // Sum of all line costs (read-only)
  lineCount: number;                    // Number of lines
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
```

#### Timesheet Line (nested in array)
```typescript
{
  lineId: string;                       // unique within timesheet
  dayOfWeek: string;                    // "Monday" | "Tuesday" | … | "Sunday"
  workDate: string;                     // ISO date
  hours: number;
  projectId?: string;                   // Required if billable to project
  costElement: string;                  // From labor rate card default or override
  description?: string;
  approverComment?: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Posted";
}
```

---

### 2.8 Internal Trade Aggregate (v1: simplified)

**Entity Type**: `itr_internal_trade` (wraps inventory org ↔ project org flows)

#### State Fields
```typescript
{
  tradeId: string;                      // PK: itr-{UUID}
  type: "PO" | "SO";                    // Internal PO from project; Internal SO from inventory
  supplierOrgId: string;                // Source org (inventory org for SO)
  customerOrgId: string;                // Destination org (project org for SO)
  projectId?: string;                   // Associated project (if trade is project-related)
  items: [
    {
      tradeLineId: string;
      skuId: string;
      quantity: number;
      quantityUom: string;
      unitPrice: number;                // Transfer price; v1 default = standard cost + 0% markup
      totalPrice: number;               // quantity × unitPrice
      costElement: string;              // How cost element routes at posting
      status: "Pending" | "Issued" | "Received" | "Invoiced" | "Settled";
    }
  ];
  totalAmount: number;
  status: "Draft" | "Released" | "Issued" | "Received" | "Closed" | "Cancelled";
  issuedAt?: string;
  receivedAt?: string;
  settledAt?: string;
  createdAt: string;
  createdBy: string;
  version: number;
}
```

---

## 3. Event Schemas (v1 In-Scope)

### 3.1 Project Events

#### `proj.project_created`
**Emitted By**: Project.create() command  
**Payload**:
```typescript
{
  projectId: string;                    // New project ID
  name: string;
  description?: string;
  projectType: "Internal" | "Capital" | "Billable" | "Service";
  customerId?: string;
  contractId?: string;
  budgetAmount: number;
  defaultWIPAccountId: string;
  defaultCloseAccountId: string;
  startDate: string;
  projectManagerId: string;
  organizationId: string;
}
```
**Governance**: Risk = Low; No approval required.

#### `proj.project_activated`
**Emitted By**: Project.activate() command  
**Payload**:
```typescript
{
  projectId: string;
  activatedAt: string;                  // ISO timestamp
}
```
**Governance**: Risk = Medium; Tier 1+.

#### `proj.project_held`
**Emitted By**: Project.hold() command  
**Payload**:
```typescript
{
  projectId: string;
  heldAt: string;
  holdReason?: string;
}
```
**Governance**: Risk = Low; Tier 1+.

#### `proj.project_resumed`
**Emitted By**: Project.resume() command  
**Payload**:
```typescript
{
  projectId: string;
  resumedAt: string;
}
```
**Governance**: Risk = Low; Tier 1+.

#### `proj.project_completed`
**Emitted By**: Project.complete() command (guards: no open required txns, all approvals done)  
**Payload**:
```typescript
{
  projectId: string;
  completionType: "FG_Conversion" | "Expense_Close";  // At completion, project specifies how WIP closes
  completedAt: string;
  finalWIPMaterialBalance: number;
  finalWIPLaborBalance: number;
  finalWIPTotalBalance: number;
  closeAccountId?: string;              // GL account for non-FG close
}
```
**Governance**: Risk = High; Tier 2+. Event carries causation of all prior events and guard results.

#### `proj.project_cancelled`
**Emitted By**: Project.cancel() command (guards: no GL-posted txns yet, or explicit override with Tier 3+)  
**Payload**:
```typescript
{
  projectId: string;
  cancellationReason: string;
  cancelledAt: string;
}
```
**Governance**: Risk = High; Tier 2+ (or Tier 3+ if reversing posted GL).

---

### 3.2 Project WIP Events

#### `proj.wip_created`
**Emitted By**: Project.create() automatically creates associated WIP object  
**Payload**:
```typescript
{
  wipId: string;
  projectId: string;
  organizationId: string;
}
```
**Governance**: Risk = Low; System-generated.

#### `proj.wip_material_posted`
**Emitted By**: Event processor consuming `inv.issue.posted` with project context  
**Payload**:
```typescript
{
  wipId: string;
  projectId: string;
  inventoryIssueEventId: string;        // Causation: triggered by inv event
  skuId: string;
  quantity: number;
  quantityUom: string;
  unitCost: number;
  totalCost: number;                    // quantity × unitCost
  costElement: string;
  scrapQuantity?: number;               // If applicable from BOM scrap %
  postedAt: string;
}
```
**Governance**: Risk = Medium; Tier 1+.

#### `proj.wip_labor_posted`
**Emitted By**: Event processor consuming `h2r.timesheet_approved` approved lines  
**Payload**:
```typescript
{
  wipId: string;
  projectId: string;
  timesheetLineId: string;              // Causation: triggered by timesheet line
  employeeId: string;
  hours: number;
  hourlyRate: number;
  totalCost: number;                    // hours × hourlyRate
  costElement: string;
  postedAt: string;
}
```
**Governance**: Risk = Medium; Tier 1+.

#### `proj.wip_closed`
**Emitted By**: Event processor on `proj.project_completed` event  
**Payload**:
```typescript
{
  wipId: string;
  projectId: string;
  closureType: "FG_Conversion" | "Expense_Close";
  finalMaterialBalance: number;
  finalLaborBalance: number;
  finalTotalBalance: number;
  closedAt: string;
}
```
**Governance**: Risk = High; Tier 2+.

---

### 3.3 Inventory-Project Events

#### `inv.issue.posted` (EXTENDED for project context)
**Emitted By**: Inventory.issueFromStock() command  
**Payload (ADDED FIELDS)**:
```typescript
{
  // ... existing inv fields ...
  issueId: string;
  itemId: string;
  quantity: number;
  quantityUom: string;
  unitCost: number;
  totalCost: number;
  organizationId: string;
  
  // NEW PROJECT CONTEXT (optional):
  projectId?: string;                   // If issue is for a project
  projectWipId?: string;                // Target WIP object
  bomId?: string;                       // If issue matches BOM component
  bomComponentFlag?: boolean;           // true = this issue is from approved BOM
  isBomMaterialIssue?: boolean;         // Synonym for above
}
```
**Governance**: Risk = Medium; Tier 1+. If `bomComponentFlag=true`, may carry additional governance context.

#### `inv.receipt.posted` (EXTENDED for project context)
**Emitted By**: Inventory.receiveGoods() command  
**Payload (ADDED FIELDS)**:
```typescript
{
  // ... existing inv fields ...
  receiptId: string;
  itemId: string;
  quantity: number;
  quantityUom: string;
  receivedCost: number;                 // Unit cost to ledger
  totalCost: number;
  organizationId: string;
  
  // NEW PROJECT CONTEXT (optional):
  projectId?: string;                   // If receipt is project-created finished good
  projectWipId?: string;                // Source WIP being converted
  isProjectFinishedGood?: boolean;      // true = receipt closes project WIP
  aggregatedWIPCost?: number;           // Total WIP cost rolled into this receipt (for FG conversion)
}
```
**Governance**: Risk = Medium; Tier 1+.

---

### 3.4 BOM Events

#### `inv.bom_created`
**Emitted By**: BOM.create() command  
**Payload**:
```typescript
{
  bomId: string;
  parentSkuId: string;
  revision: string;
  effectiveFrom: string;
  projectEligible: boolean;
  costingProfile: string;
}
```
**Governance**: Risk = Low; Tier 1+.

#### `inv.bom_component_added`
**Emitted By**: BOM.addComponent() command  
**Payload**:
```typescript
{
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
```
**Governance**: Risk = Low; Tier 1+.

---

### 3.5 Cost Element Events

#### `r2r.cost_element_created`
**Emitted By**: CostElement.create() command  
**Payload**:
```typescript
{
  costElementId: string;
  name: string;
  type: "MATERIAL" | "LABOR" | "OVERHEAD";
  costClass: "Direct" | "Indirect";
  glAccountId: string;
  glAccountAlternate?: string;
  taxCode?: string;
}
```
**Governance**: Risk = Medium; Tier 2+ (GL account assignment is sensitive).

---

### 3.6 Internal Trade Events

#### `itr.internal_po_created`
**Emitted By**: InternalTrade.createPO() command  
**Payload**:
```typescript
{
  tradeId: string;
  projectId: string;                    // Must exist
  supplierOrgId: string;                // Inventory org
  customerOrgId: string;                // Project org (derived from project)
  items: [
    {
      tradeLineId: string;
      skuId: string;
      quantity: number;
      quantityUom: string;
      unitPrice: number;                // Standard cost or configured transfer price
      totalPrice: number;
      costElement: string;
    }
  ];
  totalAmount: number;
  createdAt: string;
}
```
**Governance**: Risk = Medium; Tier 1+.

#### `itr.internal_so_created`
**Emitted By**: InternalTrade.createSO() command (mirrors PO timing)  
**Payload**:
```typescript
{
  tradeId: string;                      // Same ID as linked PO
  projectId: string;
  supplierOrgId: string;
  customerOrgId: string;
  items: [ /* same as PO */ ];
  totalAmount: number;
  linkedPoId: string;                   // FK to PO event
}
```
**Governance**: Risk = Medium; Tier 1+.

#### `itr.internal_issue_posted`
**Emitted By**: Event processor; wraps `inv.issue.posted` with internal trade context  
**Payload**:
```typescript
{
  tradeLineId: string;
  projectId: string;
  skuId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sourceInventoryIssueEventId: string;  // Causation
  costElement: string;
}
```
**Governance**: Risk = Medium; Tier 1+.

#### `itr.internal_receipt_posted`
**Emitted By**: Event processor; wraps `inv.receipt.posted` with internal trade context  
**Payload**:
```typescript
{
  tradeLineId: string;
  projectId: string;
  skuId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sourceInventoryReceiptEventId: string;  // Causation
  costElement: string;
}
```
**Governance**: Risk = Medium; Tier 1+.

---

### 3.7 H2R Labor Events

#### `h2r.timesheet_created`
**Emitted By**: Timesheet.create() command  
**Payload**:
```typescript
{
  timesheetId: string;
  employeeId: string;
  timePeriodStart: string;
  timePeriodEnd: string;
}
```
**Governance**: Risk = Low; Tier 1+.

#### `h2r.timesheet_line_added`
**Emitted By**: Timesheet.addLine() command  
**Payload**:
```typescript
{
  timesheetId: string;
  lineId: string;
  workDate: string;
  hours: number;
  projectId?: string;
  costElement: string;
  description?: string;
}
```
**Governance**: Risk = Low; Tier 1+.

#### `h2r.timesheet_submitted`
**Emitted By**: Timesheet.submit() command  
**Payload**:
```typescript
{
  timesheetId: string;
  employeeId: string;
  timePeriodStart: string;
  timePeriodEnd: string;
  totalHours: number;
  totalCost: number;
  liineCount: number;
  submittedAt: string;
}
```
**Governance**: Risk = Low; Tier 1+.

#### `h2r.timesheet_approved`
**Emitted By**: Timesheet.approve() command (governance-gated)  
**Payload**:
```typescript
{
  timesheetId: string;
  employeeId: string;
  approvedBy: string;
  approvedAt: string;
  totalHours: number;
  totalCost: number;
  approvedLines: [
    {
      lineId: string;
      workDate: string;
      hours: number;
      rate: number;
      cost: number;
      projectId?: string;
      costElement: string;
    }
  ];
}
```
**Governance**: Risk = Medium; Tier 2+ (labor cost approval).

#### `h2r.timesheet_rejected`
**Emitted By**: Timesheet.reject() command  
**Payload**:
```typescript
{
  timesheetId: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectionReason: string;
}
```
**Governance**: Risk = Low; Tier 1+ (same tier who can approve).

#### `h2r.labor_rate_created`
**Emitted By**: LaborRateCard.create() command  
**Payload**:
```typescript
{
  rateCardId: string;
  employeeId: string;
  effectiveFrom: string;
  rate: number;
  rateType: "Hourly" | "Salaried" | "Project";
  defaultCostElement: string;
}
```
**Governance**: Risk = Medium; Tier 2+ (compensation data).

---

## 4. Idempotency & Replay Rules

### 4.1 Command Idempotency
- Client generates `idempotencyKey` (UUID) before sending command.
- Server stores mapping: `(commandType, entityId, idempotencyKey) → eventId`.
- If duplicate command with same key arrives, server returns cached `eventId` without replay.

### 4.2 Event Replay Safety
- **Detection**: Projections check `eventId` before applying. If `eventId` exists in projection, skip.
- **Causation Chain**: When consuming an event, downstream handlers record `causationId`. If same upstream event ID is replayed, downstream deduplicates by checking for existing `causationId` in projection.
- **WIP Accumulation**: Material and labor posting both use idempotency checks. If same issue/timesheet line event replayed, WIP balance does not double.

### 4.3 GL Posting Idempotency
- All SLA entries carry `sourceEventId`. Before posting a journal line, check if `sourceEventId` already exists in GL. If yes, skip or reconcile reversals.

---

## 5. v1 Constraints (Decisions Locked)

1. **Project Granularity**: Costs tracked at **project level only**; WBS/task-level tracking deferred to v2.
2. **Labor Source**: **H2R timesheets only** in v1; payroll import deferred.
3. **Burden Allocation**: **Not automated in v1**; schema includes `wipOverheadBalance` as extension point, but posting is manual/zero.
4. **Inventory Reservations**: **Not required in v1**; issue fails on shortage with deterministic error response.
5. **Internal Trade**: **Simplified v1**: internal trade uses **standard cost transfer price (0% markup)** by default; configurable markup rules deferred.
6. **Project Close**: Two patterns supported:
   - **FG Conversion**: WIP rolled into inventory receipt; COGS recognized on sale.
   - **Expense-Only Close**: WIP posted to configured expense/capital GL account; no inventory.
7. **Multi-Tenant**: Single-tenant scope in v1 (all events carry `organizationId`; future tenancy logic TBD).

---

## 6. Sign-Off Checklist

- [ ] Project aggregate and lifecycle states approved
- [ ] Project WIP accumulation model approved
- [ ] BOM and cost element schemas approved
- [ ] H2R timesheet and labor rate schemas approved
- [ ] Internal trade event flow approved (PO/SO/issue/receipt)
- [ ] All event schemas (payloads and governance) approved
- [ ] Idempotency and replay strategy approved
- [ ] v1 constraints (no WBS granularity, no payroll import, no burden automation, no reservations, standard-cost transfer pricing) locked
- [ ] Integration contract for event-processor, mesh-gateway, and R2R approved
- [ ] All schemas committed to TypeScript interfaces in foundation-erp/src/events/schemas/

---

## 7. Next Steps (Phase 1)

Once sign-off complete:
1. Generate TypeScript event interfaces from this document.
2. Add database migration scripts for event schema and projection tables.
3. Implement Project aggregate with command handlers.
4. Implement Project WIP projection.
5. Add project context fields to inventory events.
6. Add BOM and cost element aggregates.
