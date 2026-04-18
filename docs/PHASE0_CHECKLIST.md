# Phase 0 Implementation Checklist: Schema Contracts & Sign-Off Requirements

**Date**: 2026-04-18  
**Phase**: 0 (Baseline Alignment)  
**Blocking Status**: Blocks all Phase 1 work until all items complete and approved

---

## Approval Checklist

### Executive & Architecture

- [ ] **Scope decision confirmation**: Review v1 constraints locked in PHASE0_SCHEMA_CONTRACTS.md §5:
  - Project granularity (level, not WBS/task)
  - H2R timesheet as primary labor source (not payroll import)
  - Direct labor only (no burden allocation automation)
  - No inventory reservations (shortage-fail behavior required)
  - Internal trade at standard cost (0% markup default)
  - Two close patterns (FG conversion + expense-only)
  - Single-tenant scope in v1
  
- [ ] **Architectural fit review**: Schema aligns with constitutional layer philosophy (event-sourced, governance-aware, ERP-agnostic, replayable)

- [ ] **Governance model approval**: Authority tier requirements confirmed for each event risk level (Low/Medium/High)

- [ ] **Integration boundaries approved**: 
  - Event-processor consumes and correlates project/inventory/labor events
  - Mesh-gateway enforces governance and routes to vendor ERPs
  - Integration-hub exposes project commands as hypermedia/MCP functions

---

### Domain Architects

- [ ] **Project Aggregate** (PHASE0_SCHEMA_CONTRACTS.md §2.2):
  - State fields complete and reviewed
  - Lifecycle transitions (Draft → Active → OnHold ↔ → Completed/Cancelled) locked
  - Closing behavior for FG and expense-only paths documented
  - Budget vs actual costing model confirmed
  
- [ ] **Project WIP Aggregate** (§2.3):
  - Accumulation logic for material + labor clear
  - Projection balance fields (_material, _labor, _total) confirmed
  - WIP close guards (no open txns, all approvals done) specified
  - Replay safety for WIP posting events ensured
  
- [ ] **BOM Aggregates** (§2.4–2.5):
  - BOM header with project-eligibility and costing profile approved
  - BOM component with scrap % and cost element classification confirmed
  - Parent-child recursion behavior specified (for scope of Phase 1)
  - Cost rollup planning (BOM planned cost → project budget tracking) deferred to Phase 3
  
- [ ] **Cost Element Master** (§2.6):
  - Entity ownership approved (R2R or Project domain?)
  - GL account mapping strategy (primary + alternate) confirmed
  - Mapping to vendor cost element types (SAP/Oracle/Dynamics) designed
  - Authority tier for GL account changes specified
  
- [ ] **H2R Labor Aggregates** (§2.7):
  - Timesheet lifecycle (Draft → Submitted → Approved/Rejected → Posted) confirmed
  - Labor rate card lookup strategy (employee or role default) locked
  - Timesheet line project allocation model approved (projectId required for project charges)
  - Integration with Authority/Governance for labor cost approval specified
  
- [ ] **Internal Trade Aggregates** (§2.8):
  - PO/SO wrappers around inventory org ↔ project org flows confirmed
  - Transfer pricing strategy (standard cost + 0% in v1; configurable later) approved
  - Reconciliation model for internal issue/receipt mirroring specified
  - Settlement accounting path defined

---

### Event Schemas & Contracts

- [ ] **Project Events** (PHASE0_SCHEMA_CONTRACTS.md §3.2):
  - All 6 events defined, payloads reviewed
  - Governance context (risk level, required tier) assigned
  - Causation/correlation fields ensure replay traceability
  
- [ ] **Project WIP Events** (§3.2):
  - 4 events (created, material_posted, labor_posted, closed) approved
  - Causation linking to source inventory/labor events confirmed
  - Idempotency keys and replay detection strategy locked
  
- [ ] **Inventory-Project Extended Events** (§3.3):
  - inv.issue.posted extended with projectId, projectWipId, bomComponentFlag fields
  - inv.receipt.posted extended with project-finished-good context
  - All new fields are optional for backward compatibility
  
- [ ] **BOM & Cost Element Events** (§3.4–3.5):
  - BOM creation and component addition events approved
  - Cost element creation event with GL mapping approved
  - Authority governance specified for sensitive operations
  
- [ ] **Internal Trade Events** (§3.6):
  - 4 events (PO created, SO created, issue posted, receipt posted) defined
  - Mirroring logic between issue/receipt confirmed
  - Causation linking to source inventory events specified
  
- [ ] **H2R Labor Events** (§3.7):
  - Timesheet lifecycle events (created, line added, submitted, approved, rejected)
  - Labor rate creation event
  - Approved timesheet triggers labor cost event generation (Phase 2)
  - All payloads include governante context for approval tier checks

---

### Idempotency & Replay Strategy

- [ ] **Command Idempotency** (PHASE0_SCHEMA_CONTRACTS.md §4.1):
  - Server-side idempotency key storage: (commandType, entityId, idempotencyKey) → eventId mapping
  - Retry-safety guaranteed: duplicate commands return cached eventId
  - Client generation of idempotencyKey (UUID) confirmed as responsibility
  
- [ ] **Event Replay Safety** (§4.2):
  - Projection deduplication: check eventId before applying
  - Causation chain deduplication: downstream handlers skip if causationId exists
  - WIP accumulation: material/labor posting checks prevent double-posting on replay
  - Test scenario: replay full event stream 3× → identical projection state confirmed
  
- [ ] **GL Posting Idempotency** (§4.3):
  - All SLA entries carry sourceEventId
  - Pre-posting check: if sourceEventId exists in GL, do not repost
  - Reconciliation logic for reversal entries specified (if needed)

---

### TypeScript & Code Contracts

- [ ] **Event Schema Interfaces** (projectsAndTradeEventSchemas.ts):
  - All client payloads defined (EventPayload_*)
  - All projection schemas defined (*Projection)
  - Union types for dispatch (ProjectEventPayload, etc.) created
  - Idempotency structures (IdempotencyKey, EventCorrelation, GLPostingIdempotency) defined
  
- [ ] **Domain Command Interfaces** (to be created in Phase 0.5):
  - Project commands (CreateProjectCmd, ActivateProjectCmd, …)
  - BOM commands (CreateBOMCmd, AddComponentCmd)
  - H2R Timesheet commands (CreateTimesheetCmd, SubmitTimesheetCmd, …)
  - Internal Trade commands (CreateInternalPOCmd, CreateInternalSOCmd)
  - All command DTOs include idempotencyKey and governance context
  
- [ ] **Event Handler Signatures** (to be created in Phase 0.5):
  - Projection handlers: (projection, event, context) → updated projection
  - SLA posting handlers: (event) → journal lines[]
  - Integration handlers: (event) → downstream commands/events

---

### v1 Constraints & Locks

- [ ] **Project Granularity**: Project-level costs confirmed. WBS/task tracking deferred.
- [ ] **Labor Source**: H2R timesheets confirmed as LAB_SOURCE. Payroll import deferred.
- [ ] **Burden Allocation**: Not automated in v1. wipOverheadBalance reserved for v2. No overhead posting.
- [ ] **Inventory Reservations**: Not required in v1. Issue fails on shortage; no soft/hard reservations.
- [ ] **Internal Trade Pricing**: Standard cost + 0% markup locked for v1. Configurable pricing deferred.
- [ ] **Project Close Patterns**: FG conversion + expense-only close both supported in v1.
- [ ] **Multi-Tenant**: Single-tenant in v1. All events carry organizationId for future segmentation.

---

### Integration Contracts

- [ ] **Event-Processor Consumption** (to be formalized):
  - Event types processor must handle: project.*, proj.material.*, proj.labor.*, inv.issue (with project context), inv.receipt (with project context), itr.*, h2r.timesheet_approved, h2r.labor_rate_created
  - Handlers must be idempotent (check causationId before applying)
  - Dead-letter queue strategy for unhandled events
  
- [ ] **Mesh-Gateway Mappings** (to be formalized):
  - Canonical project → SAP PS mapping (WBS → project, project cost type → SAP cost element, close → actual cost reconciliation)
  - Canonical project → Oracle Projects mapping
  - Canonical project → Dynamics Project Ops mapping
  - Governance gates: enforce authority tiers before routing to vendor systems
  
- [ ] **Integration-Hub Contracts** (to be formalized):
  - Project CRUD functions: createProject, listProjects, getProject, etc.
  - Project lifecycle functions: activateProject, completeProject, cancelProject
  - Cost retrievals: getProjectWIPSummary, getProjectCostDetail
  - All functions gated by Charter + Authority tier validation

---

### Data Model & Migrations

- [ ] **Database Schema** (to be created in Phase 1):
  - Tables: project, project_wip, inv_bom_header, inv_bom_component, r2r_cost_element, h2r_labor_rate_card, h2r_timesheet, h2r_timesheet_line, itr_internal_trade, itr_internal_trade_line
  - Indexes: project.status, project_wip.projectId, h2r_timesheet.status, itr_internal_trade.projectId
  - Foreign keys for referential integrity
  - Event store extensions: correlationId, causationId, governance_json
  
- [ ] **Projection Tables** (to be created in Phase 1):
  - project_projection, project_wip_projection, bom_header_projection, bom_component_projection, cost_element_projection, h2r_timesheet_projection, internal_trade_projection
  - All projections include version and lastEventAt for optimistic locking

---

### Documentation & Handoff

- [ ] **Schema Contracts Doc** (PHASE0_SCHEMA_CONTRACTS.md):
  - All sections reviewed and approved by stakeholders
  - Ambiguities resolved and footnoted
  - Sign-off section completed with initials/dates
  
- [ ] **TypeScript Schemas Generated** (projectsAndTradeEventSchemas.ts):
  - No drift from SchemaContracts doc
  - Exported interfaces used consistently in all domains
  - Unit tests generated for event schema validation
  
- [ ] **Implementation Notes Updated** (/memories/repo/implementation-notes.md):
  - Add notes about event idempotency in replays
  - Add notes about causationId linking for correlation
  - Add notes about governance context enforcement
  - Add notes about Phase 0.5 domain command creation

---

### Phase 0.5 Prep: Domain Commands (NOT BLOCKING; runs in parallel after Phase 0 sign-off)

- [ ] **Project Commands**:
  - CreateProjectCmd → ProjectCreatedEvent
  - ActivateProjectCmd → ProjectActivatedEvent
  - HoldProjectCmd → ProjectHeldEvent
  - …etc.
  
- [ ] **BOM Commands**:
  - CreateBOMCmd → BOMCreatedEvent
  - AddComponentCmd → BOMComponentAddedEvent
  
- [ ] **H2R Timesheet Commands**:
  - CreateTimesheetCmd → TimesheetCreatedEvent
  - SubmitTimesheetCmd → TimesheetSubmittedEvent
  - ApproveTimesheetCmd → TimesheetApprovedEvent
  - …etc.
  
- [ ] **All commands include**:
  - idempotencyKey (UUID)
  - actor (user/system ID + authority tier)
  - governance context (risk level, required tier)
  - causationId (if triggered by prior event)

---

## Sign-Off Section

**Approval Tracking**:
```
Executive Sponsor:  ___________________  Date: __________
Architecture Lead:  ___________________  Date: __________
Domain Lead (Proj): ___________________  Date: __________
Domain Lead (Inv):  ___________________  Date: __________
Domain Lead (H2R):  ___________________  Date: __________
Domain Lead (R2R):  ___________________  Date: __________
Engineering Lead:   ___________________  Date: __________
QA Lead (Phase 7):  ___________________  Date: __________
```

**Noted Issues & Resolutions**:
- [ ] None yet; issues to be tracked in real-time as Phase 0 work progresses.

---

## Gate: Phase 0 Complete?

**Release Criteria**:
- [x] PHASE0_SCHEMA_CONTRACTS.md complete and signed off
- [x] projectsAndTradeEventSchemas.ts TypeScript interfaces generated and tested
- [ ] All 50+ checklist items completed and approved
- [ ] No open architecture questions
- [ ] All v1 constraints locked (no ambiguity about what is/is not in scope)
- [ ] Integration contracts with event-processor, mesh-gateway, R2R signed off
- [ ] Ready to begin Phase 1 (Project aggregate implementation)

**Timeline**:
- Phase 0 start: 2026-04-18
- Phase 0 target completion: 2026-04-25 (parallel with Phase 0.5 command creation)
- Phase 1 kickoff: 2026-04-28 (after all Phase 0 approvals lock in)
