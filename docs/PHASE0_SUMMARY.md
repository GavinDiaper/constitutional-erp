# Phase 0 Implementation Summary: Baseline Alignment & Schema Contracts

**Completion Date**: 2026-04-18  
**Status**: Ready for stakeholder sign-off  
**Blocking**: Phase 1 cannot begin until all Phase 0 documents are approved

---

## What Was Delivered in Phase 0

Phase 0 established the complete **canonical schema contracts**, **event models**, and **governance rules** that will guide all downstream implementation (Phases 1–7). This is the foundation layer—get it right here, or debugging becomes exponentially harder in later phases.

### 1. Core Documents Created

#### **[docs/PHASE0_SCHEMA_CONTRACTS.md](docs/PHASE0_SCHEMA_CONTRACTS.md)** — 150+ lines
**Purpose**: Single source of truth for all domain aggregates, event payloads, and idempotency rules.

**Contents**:
- **§1: Core Principles** — Event-sourced design, idempotency strategy, governance context
- **§2: Domain Entity Schemas** (7 aggregates):
  - Project aggregate (status lifecycle, budget vs actual, WIP balances)
  - Project WIP aggregate (material + labor accumulation)
  - BOM Header & Component aggregates (multi-level Bill of Materials)
  - Cost Element Master (GL account mappings)
  - H2R Labor Rate Card (employee hourly rates)
  - H2R Timesheet (labor time capture by project)
  - Internal Trade aggregate (simplified v1 PO/SO model)
  
- **§3: Event Schemas** (17 event types in v1):
  - 6 Project lifecycle events (created, activated, held, resumed, completed, cancelled)
  - 4 Project WIP events (created, material_posted, labor_posted, closed)
  - 2 Inventory-Project context events (issue + receipt extended with project fields)
  - 2 BOM events (created, component added)
  - 1 Cost Element event (created)
  - 4 Internal Trade events (PO created, SO created, issue posted, receipt posted)
  - 6 H2R Labor events (timesheet lifecycle + rate card creation)
  - All include governance context (risk level, required tier)

- **§4: Idempotency & Replay Rules**:
  - Command-level deduplication: `(commandType, entityId, idempotencyKey) → eventId`
  - Event-level deduplication: check `eventId` before projection, skip if duplicate
  - Causation chain tracking: `causationId` links upstream events ↔ downstream handlers
  - WIP posting safeguards: prevent double-posting on replay

- **§5: v1 Constraints** (6 major locks):
  - Project-level costing only (no WBS/task granularity yet)
  - H2R timesheets as labor source (no payroll import in v1)
  - Direct labor only (no automatic overhead/burden allocation)
  - No inventory reservations (shortage fails deterministically)
  - Internal trade at standard cost (0% markup default)
  - Both FG conversion and expense-only close patterns supported

- **§6: Sign-Off Checklist** — 50+ approval items across Architecture, Domain, Events, Governance, Integration

#### **[docs/PHASE0_CHECKLIST.md](docs/PHASE0_CHECKLIST.md)** — 200+ lines
**Purpose**: Detailed approval tracking and gate criteria before Phase 1 starts.

**Contents**:
- **Approval sections** (checked by domain architects, event engineers, integration leads):
  - Executive & Architecture sign-offs (scope confirmation, governance model, integration boundaries)
  - Domain Architect sign-offs (all 7 aggregates, event schemas, idempotency strategy)
  - TypeScript & Code Contract sign-offs (interface generation, command dispatch, event handlers)
  - v1 Constraints locked (no ambiguity about scope)
  - Integration Contracts (event-processor, mesh-gateway, Integration Hub handoff)
  - Data Model & Migrations (database schema design verified)
  
- **Phase 0.5 Parallel Work**: Domain command creation (does not block Phase 1 kickoff, but should start once Phase 0 approvals done)
  
- **Gate: Phase 0 Complete?** — Release criteria for Phase 1 kickoff
  - All 50+ checklist items completed and approved
  - No open architecture questions
  - All v1 constraints locked
  - Integration contracts signed off

#### **[services/foundation-erp/src/events/schemas/projectsAndTradeEventSchemas.ts](services/foundation-erp/src/events/schemas/projectsAndTradeEventSchemas.ts)**
**Purpose**: TypeScript type safety for all event payloads (client inputs) and projections (read model state).

**Interface Categories**:
- **EventPayload_*** (client-input payloads for 17 v1 events)
  - ProjectCreated, ProjectActivated, ProjectHeld, ProjectResumed, ProjectCompleted, ProjectCancelled
  - WIPCreated, WIPMaterialPosted, WIPLaborPosted, WIPClosed
  - InventoryIssuedPosted, InventoryReceiptPosted (with project context)
  - BOMCreated, BOMComponentAdded
  - CostElementCreated
  - InternalPOCreated, InternalSOCreated, InternalIssuePosted, InternalReceiptPosted
  - TimesheetCreated, TimesheetLineAdded, TimesheetSubmitted, TimesheetApproved, TimesheetRejected
  - LaborRateCreated

- **[AggregateType]Projection** (read model: state reconstructed from events)
  - ProjectProjection, ProjectWIPProjection
  - BOMHeaderProjection, BOMComponentProjection
  - CostElementProjection
  - H2RLaborRateCardProjection, H2RTimesheetProjection
  - InternalTradeProjection

- **Union Types** for dispatch (ProjectEventPayload, ProjectWIPEventPayload, AllEventPayload, etc.)

- **Idempotency Structures** (IdempotencyKey, EventCorrelation, GLPostingIdempotency)

#### **[services/foundation-erp/src/domain/commands/projectCommandSchemas.ts](services/foundation-erp/src/domain/commands/projectCommandSchemas.ts)**
**Purpose**: TypeScript interfaces for all v1 commands that trigger events.

**Command Categories** (1 per command; all include `CommandContext`—idempotencyKey, actor, governance):
- **Project Commands**: CreateProjectCmd, ActivateProjectCmd, HoldProjectCmd, ResumeProjectCmd, CompleteProjectCmd, CancelProjectCmd
- **BOM Commands**: CreateBOMCmd, AddBOMComponentCmd
- **Cost Element Commands**: CreateCostElementCmd
- **Internal Trade Commands**: CreateInternalPOCmd, CreateInternalSOCmd
- **H2R Timesheet Commands**: CreateTimesheetCmd, AddTimesheetLineCmd, SubmitTimesheetCmd, ApproveTimesheetCmd, RejectTimesheetCmd
- **H2R Labor Rate Commands**: CreateLaborRateCardCmd, ApproveLaborRateCardCmd

Each command includes:
- Detailed guard conditions (preconditions)
- Execution behavior and event generation
- Governance gates (authority tier requirements)

---

## Key Design Decisions Locked in Phase 0

### v1 Scope (Non-Negotiable for Phase 1)

| Aspect | v1 Decision | Rationale | v2+ Deferred |
|--------|-----------|-----------|------------|
| **Project Granularity** | Project level only | Simplify WIP accumulation; most projects in SMB are monolithic | WBS/task-level costing with hierarchical cost allocation |
| **Labor Source** | H2R timesheets | Direct, auditability; employee time entry familiar to SMBs | Payroll import (requires payroll adapter integration) |
| **Burden Allocation** | Direct labor only; overhead deferred | Reduces GL account complexity; focus on material + direct labor | Automated burden calculation and allocation rules |
| **Inventory Reservations** | Not required; shortage fails | Avoids complex reservation ledger; projects can requisition just-in-time | Advanced WMS module with soft/hard reservations |
| **Internal Trade Pricing** | Standard cost + 0% markup | Neutral transfer pricing; simplifies internal reconciliation | Configurable markup rules, variance analysis, transfer pricing disputes |
| **Project Close Patterns** | 2 supported: FG conversion + expense-only | Handles both manufacturing (convert to finished goods) and service (expense close) | Capital project amortization schedules, milestone-based revenue recognition |
| **Multi-Tenant Isolation** | Single-tenant v1; organizationId placeholders | Organizational context ready; tenancy logic deferred | Full row-level security (RLS) and tenant segregation |

### Governance Model Locked

**Authority Tier Requirements** (enforced on high-risk events):

| Event Type | Risk Level | Required Tier |
|-----------|-----------|---|
| Project creation | Low | 1+ |
| Project activation | Medium | 1+ |
| Project completion | High | 2+ |
| Project cancellation | High | 2+ (or 3+ if GL-posted) |
| Material issue to WIP | Medium | 1+ |
| Labor timesheet approval | Medium | 2+ (payroll sensitive) |
| Cost element GL mapping | Medium | 2+ (GL sensitive) |
| Internal transfer price changes | High | 3+ (transfer pricing sensitive) |
| WIP revaluation | High | 3+ |

### Integration Contracts Locked

**Event-Processor Consumption**:
- Consumes: project.*, proj.wip.*, inv.issue (with project context), inv.receipt (with project context), itr.*, h2r.timesheet_approved
- Produces: downstream project WIP events, SLA posting commands to R2R, GL journal entries
- **Idempotency**: All handlers check causationId before applying; deduplicates on replay

**Mesh-Gateway Routing**:
- Maps canonical project commands to SAP PS, Oracle Projects, Dynamics 365 Project Ops
- Enforces authority tiers via Charter + Governance engines before routing

**Integration Hub Exposure**:
- Project CRUD functions: createProject, listProjects, getProject, etc.
- Project lifecycle functions: activateProject, completeProject, cancelProject
- Cost retrieval: getProjectWIPSummary, getProjectCostDetail
- All functions gated by authority evaluation

---

## What Happens Next: Sign-Off Path & Phase 1 Readiness

### Immediate Actions (Before Phase 1)

1. **Stakeholder Review** (1–2 days):
   - Architecture lead reviews PHASE0_SCHEMA_CONTRACTS.md §1–4 (core models)
   - Domain architects review §2 (aggregates) and accept their domain's entities
   - Integration leads review §6.2–6.3 (canonical contracts) and sign off on downstream dependencies
   - Security/Governance lead reviews §6.1 (authority tiers) and signs off

2. **Approve PHASE0_CHECKLIST.md** (parallel; 1 day):
   - Each domain lead signs off their section (50+ boxes)
   - No hard blockers expected; minor clarifications should be resolvable in review

3. **Validate TypeScript Interfaces** (technical review; 1 day):
   - Verify projectsAndTradeEventSchemas.ts matches PHASE0_SCHEMA_CONTRACTS.md payloads
   - Verify projectCommandSchemas.ts reflects all commands and guards described
   - Unit tests generated for event validation (trivial; schema-only)

4. **Sign Phase 0 Gate** (1 day after approvals):
   - Leadership sign-off on release criteria
   - v1 constraints formally locked (no scope creep)
   - Phase 1 kickoff scheduled (typically next Monday)

**Target**: Phase 0 final sign-off by 2026-04-25 (one week)

### Phase 0.5: Parallel Work (No Phase 1 Blocker)

While stakeholders review Phase 0, engineering can start **Phase 0.5: Domain Command Handlers**:
- Implement command validators for each command (guard condition checks)
- Implement command dispatch/routing (switch or map-based)
- Generate database migration stubs for schema creation
- Create audit trail storage for CommandExecutionAudit

This work is non-blocking; Phase 0.5 artifacts are incorporated into Phase 1 as-is.

### Phase 1 Kickoff (2026-04-28 estimated)

Once Phase 0 is approved:

1. **Add Projects Aggregate to Foundation ERP**
   - Create `services/foundation-erp/src/domain/proj/projectAggregate.ts`
   - Implement Project command handlers: Create, Activate, Hold, Resume, Complete, Cancel
   - Implement Project WIP command handlers and projections
   - Add event emission and causation tracking

2. **Extend Inventory for Project Context**
   - Add projectId, projectWipId, bomComponentFlag fields to inv.issue.posted and inv.receipt.posted
   - Update inventory service to emit project-context variants
   - Add inventory-project event handlers in event-processor

3. **Add BOM & Cost Element Masters**
   - Create `services/foundation-erp/src/domain/inv/bomAggregate.ts`
   - Create `services/foundation-erp/src/domain/r2r/costElementAggregate.ts` (or inv, depending on domain ownership)
   - Implement CRUD and event emission

4. **Add H2R Timesheet & Labor Rate**
   - Create `services/foundation-erp/src/domain/h2r/timesheetAggregate.ts`
   - Implement timesheet lifecycle and line management
   - Implement labor rate card aggregate

5. **Add Internal Trade Aggregates**
   - Create `services/foundation-erp/src/domain/itr/internalTradeAggregate.ts` (new domain)
   - Implement PO/SO creation and mirroring logic

6. **Database Schema & Migrations**
   - Create migration scripts for all 7 aggregates + projection tables
   - Add indexes and foreign keys
   - Run migrations in dev/test environments

7. **Event-Processor Integration** (beginning)
   - Add handlers for project.* events
   - Add handlers for inv.issue.posted / inv.receipt.posted with project context
   - Stub SLA posting orchestration (Phase 2 completes this)

---

## Critical Lockdown: What Is & Is NOT in v1

### ✅ IN SCOPE for v1 (what will be built)

- Project aggregate with 6-state lifecycle
- Project WIP accumulation (material + labor)
- BOM header + components (multi-level support)
- Cost element master with GL mapping
- H2R timesheet lifecycle (Draft → Submitted → Approved/Rejected → Posted)
- H2R labor rate card (employee hourly rates)
- Internal trade PO/SO flow (at standard cost)
- Direct material issue to WIP
- Direct labor posting from approved timesheets
- Project completion to finished goods (FG conversion)
- Project completion to expense account (expense-only close)
- Idempotent event replay and WIP reconstruction
- Authority tier governance on sensitive events
- Deterministic inventory shortage failures (no reservations)

### ❌ OUT OF SCOPE for v1 (deferred to v2+)

- WBS/task-level cost allocation (project-level only)
- Payroll system labor import (timesheets only)
- Burden/overhead allocation automation
- Inventory reservation engine (soft/hard reserves)
- Transfer pricing configurable markup rules
- Multi-tenant row-level security (single-tenant v1)
- Milestone-based revenue recognition
- Capital project amortization schedules
- Advanced WMS integration
- Phase 2 Inventory modules (reservations, lot/serial, quality)

---

## Questions to Resolve During Sign-Off

1. **Cost Element Ownership**: Will cost elements be owned by R2R (GL) or Projects domain? (Recommend R2R, but must clarify)
2. **Expense-only Close Account Selection**: At project completion for expense-only close, who chooses the GL account (expense or capital)? (Project config? User input? Posting profile rule?)
3. **Timesheet Approval Tier**: Tier 2 assumed for labor cost approval; confirm if different threshold needed by organization.
4. **Internal Trade Org Segregation**: Are internal trade organizations separate from main inventory org, or a code-based segregation? (Design decision for Phase 1.)
5. **BOM Costing Preview**: Should BOM creation include a "planned cost" preview (BOM cost rollup for project budgeting)? (Nice-to-have; Phase 3 candidate.)

---

## Files Delivered & Next Steps

| File | Purpose | Status | Next Action |
|------|---------|--------|-------------|
| [PHASE0_SCHEMA_CONTRACTS.md](docs/PHASE0_SCHEMA_CONTRACTS.md) | Single source of truth for all schemas | ✅ Complete | Stakeholder review & sign-off |
| [PHASE0_CHECKLIST.md](docs/PHASE0_CHECKLIST.md) | Approval tracking & gate | ✅ Complete | Domain leads fill checklist |
| [projectsAndTradeEventSchemas.ts](services/foundation-erp/src/events/schemas/projectsAndTradeEventSchemas.ts) | TypeScript event interfaces | ✅ Complete | Validation against schema doc |
| [projectCommandSchemas.ts](services/foundation-erp/src/domain/commands/projectCommandSchemas.ts) | TypeScript command interfaces | ✅ Complete | Code review + tests stub |
| Phase 0.5 Command Handlers (stub) | Validator + dispatcher implementations | ⏳ Paused pending review | Begin after Phase 0 sign-off |
| Phase 1 Domain Aggregates (stub) | Project, BOM, Timesheet, etc. | ⏳ Blocked on Phase 0 approval | Kickoff 2026-04-28 |

---

## How to Use These Documents

**For Architects & Leads**:
- Start with §1–2 of PHASE0_SCHEMA_CONTRACTS.md (principles + aggregates)
- Review your domain's section in PHASE0_CHECKLIST.md
- Sign off on your domain's TypeScript interfaces

**For Developers (Phase 1 onward)**:
- Reference projectsAndTradeEventSchemas.ts for event payload structure
- Reference projectCommandSchemas.ts for command guard conditions
- Implement handlers calling appendEvent() with payloads matching schemas

**For QA (Phase 7 onward)**:
- Use PHASE0_SCHEMA_CONTRACTS.md §4 to design replay tests
- Verify idempotency: replay event stream 3× → identical projections
- Verify causation: downstream handlers skip duplicate causationIds

---

## Bottom Line

**Phase 0 is the blueprint.** Phases 1–7 are implementation. If the blueprint is wrong, no amount of coding will fix it. 

**Approval path**: 
1. Review the 4 deliverables (2 markdown + 2 TypeScript)
2. Fill out PHASE0_CHECKLIST.md (50+ items across domains)
3. Sign off on release criteria
4. Phase 1 engineering kicks off with confidence that scope, governance, and integration contracts are locked

**Expected sign-off time**: 1 week (by 2026-04-25)  
**Phase 1 start**: 2026-04-28 (assuming approvals on time)
