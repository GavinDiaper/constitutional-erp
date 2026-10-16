# Role Refactor Plan: Authority, Governance, Mesh, Foundation

Status: Implemented (phases 1–6; see RoleRefactor-Implementation.md for gaps)
Author: Copilot (plan), to be reviewed
Related: Architecture v2, Authority Engine v1, Governance Engine v1, Mesh Gateway v3, Service Contracts Roadmap, Projects docs

## 1. Purpose

Align the implementation with the roles defined in the design documents.

| Component | Role (as designed) |
|---|---|
| Authority Engine | Answers *who can do what*. Derives an actor's effective tier from earned authority, credentials and assignments. |
| Governance Engine | Answers *whether the action is permissible at all* given charter rules. A pure rule evaluator that never calls Foundation. Covers separation of duties (SoD), value thresholds (require approval / escalate) and risk flags. |
| Mesh Gateway | The enforcement point. Clients never call backends directly. For every transition it (1) checks Authority, (2) checks Governance, (3) creates an approval task and returns 202 with approvers when approval or escalation is required, (4) calls the Foundation adapter only afterwards. |
| Foundation ERP | System of record. Executes valid transitions and emits events. It does **not** decide who may perform them. |

## 2. Current state (findings)

1. **UI bypasses the Mesh.** `apps/ui-sveltekit/src/routes/api/hub/**` proxies via `HUB_BASE_URL` straight to Foundation `/api/v1`. Authority checks, governance checks and approval tasks never run for UI-initiated writes.
2. **Foundation trusts client-supplied identity.** `services/foundation-erp/src/middleware/actorContext.ts` reads `x-actor-id` and `x-actor-tier` from request headers. The UI sends them from a dev actor picker (`actorStore.ts`). Anyone holding the API key can claim tier 5.
3. **Foundation makes authorisation decisions.** Hard-coded `requireTier(...)` checks exist in `projectService.ts`, `inventoryService.ts`, `api/timesheets.ts`, `api/hypermedia/h2r.routes.ts`, and (added recently) `contractService.ts`. The `governance` objects on events and HATEOAS links are labels only.
4. **Navigator uses a mix of paths.** `services/navigator-ai` has a `MeshClient` (correct path) but also calls Foundation directly with an API key (`integrationHubClient.ts`, `caiplService.ts`).
5. **MCP execution runs in Foundation.** `foundation-erp/src/api/mcp/mcp.routes.ts` executes catalog functions in-process with the caller-supplied actor. The catalog (`catalog.ts`, 131 functions) carries `riskLevel` and `governanceTag` metadata that nothing enforces.
6. **Engine coverage is thin.**
   - Governance rules are seeded only for P2P SoD, P2P PO thresholds, and a global high-value risk flag (`governance-engine/src/db/migrations/002_update_seed_rules.sql`).
   - `AuthorityDomain` is limited to `O2C | P2P | R2R | H2R`. There is no PROJ or INV domain.
   - Mesh routes only support `POST /:adapterId/:domain/:resource/:id/:action`. Create operations (no id) and domain-less resources have no path.
   - Mesh context builders exist only for the four domains above and have no contract or project shape.
7. **Hypermedia is incomplete.** Contracts, projects, milestones and WBS endpoints return plain JSON without links, so the Mesh cannot filter or gate them.

## 3. Target architecture

```
Browser / Navigator / MCP client
        |  (actor identity from verified token)
        v
Mesh Gateway  --1--> Authority Engine   (tier, credentials, assignments)
        |     --2--> Governance Engine  (SoD, thresholds, risk)
        |     --3--> Approval task (202) if approval/escalation required
        |     --4--> Foundation adapter (execute)
        v
Foundation ERP  (validates business invariants only; trusts Mesh-asserted actor)
```

Principles:
- Foundation validates business invariants (state machine, referential integrity, amounts, contract/customer match). It does not check tiers, thresholds or SoD.
- The Governance Engine is the single home of thresholds and SoD. Rules are data (migrations / charter), not code in Foundation.
- Identity is asserted by a trusted party (Mesh, backed by the identity service), not by a UI header.
- Reads that drive UI (lists, queries) may stay on the Hub path, but transitions and creates go through the Mesh.

## 4. Phased plan

Each phase is independently shippable and leaves the system working. Feature flags control enforcement cut-over.

### Phase 0: Decisions and baseline (small)

- Confirm decisions in section 7 (domain model for PROJ/INV, Mesh create path, identity trust model, approval UX).
- Add a `docs/roleRefactor.md` tracking table (below) and agree on a flag set: `ENFORCEMENT_MODE = off | shadow | enforce` for the Mesh, and `FOUNDATION_TRUST_MESH_ACTOR`.
- Capture a baseline: run all service test suites and record known failures (e.g. the pre-existing "Timesheet task locking" failure in foundation-erp) so regressions are distinguishable.

### Phase 1: Extend the engines

Authority Engine (`services/authority-engine`):
- Add domains `PROJ` and `INV` (and keep `O2C`, `P2P`, `R2R`, `H2R`) to `AuthorityDomain`, schemas and the Foundation event mapper.
- Define the action to required-tier mapping as data (authority rules) rather than the current single `approve -> FinancialApproval` map. Seed rules equivalent to today's hard-coded tiers:
  - Project: activate/hold/resume 1, complete 2, cancel 2 (force 3), milestone approve per risk.
  - Inventory: adjustment 2, cost update 3.
  - Timesheet import and rate management: 4.
- Ensure the engine reads authority subjects/tiers from H2R events so tiers come from earned authority, not headers.

Governance Engine (`services/governance-engine`):
- Add `PROJ` and `INV` to the domain enum and context schemas (new `projContextSchema`, `invContextSchema`; extend `o2cContextSchema` with `contractValue`, `createdBy`).
- New migration `004_contracts_projects_rules.sql` with rules:
  - `CON-SOD-001`: deny `o2c_contract_version_approved` when the actor created the version (`ActorIsRequester`).
  - `CON-THRESH-001/002`: `RequireApproval` at tier 3 for value > 10,000; `Escalate` to tier 4 for value > 100,000 (the thresholds currently hard-coded in `contractService.ts`; confirm with Finance).
  - Project rules: `project_complete`, `project_cancel`, `milestone_approve` thresholds and SoD (PM cannot approve own milestone billing).
  - Inventory adjustment and cost update thresholds.
  - Retain existing `RISK-001` global flag.
- Consider a `CreatedByRequester`-style condition if `ActorIsRequester` cannot express "creator of the resource" from context alone (requester = `createdBy` from the resource).
- Keep the engine pure: no Foundation calls. SoD data arrives via context and projected action history.

### Phase 2: Mesh Gateway

- Add context builders for `PROJ`, `INV` and contract resources (`contractValue`, `createdBy`, `customerId`).
- Support create and collection operations: `POST /mesh/:adapterId/:domain/:resource` (no id) and keep `/:id/:action`. Reuse the same pipeline; use `resourceId = "NEW"` or a context-only evaluation.
- Foundation adapter: translate Mesh action paths to Foundation routes for the new resources (contracts, projects, milestones, WBS, stage gates, inventory adjustments, timesheet imports, rates).
- Adapter must forward a **Mesh-asserted actor** (id, tier from Authority Engine's evaluated `effectiveTier`) using a signed header or service credential, not the raw client tier.
- Approval tasks: on approve, the existing re-check flow (`approvals.routes.ts`) re-evaluates Authority and Governance, then executes. Verify it works for the new resources and that SoD blocks the original requester from approving their own task.
- Add `ENFORCEMENT_MODE=shadow`: evaluate and log decisions without blocking, to compare with Foundation's current tier checks before cut-over.
- Expose hypermedia (see Phase 3) filtered per actor.

### Phase 3: Foundation ERP (execute, not authorise)

- Hypermedia: add links with `governance` metadata to contracts (`approve`, `amend`), projects (`activate`, `hold`, `resume`, `complete`, `cancel`), milestones (`approve`) and inventory transitions, matching what `o2c.routes.ts` already does for customers/quotes/invoices.
- Identity: `actorContext.ts` accepts actor identity only from a trusted source when `FOUNDATION_TRUST_MESH_ACTOR` is on (Mesh service credential, or a verified token from `apps/user-identity`). Direct calls with a user-claimed `x-actor-tier` are ignored or rejected.
- Remove authorisation logic after enforcement is proven:
  - `contractService.ts`: remove `actorTier` check and value bands; keep `approval_governance` only if sourced from the Governance Engine, otherwise remove it. Keep business validation (state, SoW totals).
  - `projectService.ts`: remove `requireTier`/`parseActorTier` and the hard-coded `governance` objects on events; accept the governance context supplied by the Mesh and persist it on the event.
  - `inventoryService.ts`, `api/timesheets.ts`, `api/hypermedia/h2r.routes.ts`: remove tier checks.
- Keep minimal defence in depth: reject mutating requests with no Mesh-asserted actor in `enforce` mode.
- Events: continue to append `governance_json` using the decision the Mesh passed through (risk level, required tier, tag, approver), so the audit trail reflects the real decision.
- Fix: SoW to stage seeding (already implemented in `projectService.ts`) is business logic and stays.

### Phase 4: UI (SvelteKit)

- Add `/api/mesh/**` proxy routes (server-side, holding `MESH_GATEWAY_API_KEY`) and a `lib/api/mesh.ts` client that returns a typed `{ status: 'executed' | 'pending_approval', taskId, requiredTier, approvers }`.
- Switch transitions and creates to the Mesh: contract create/approve/amend, project create/activate/hold/resume/complete/cancel, milestone create/approve, stage gates, WBS, inventory adjustments, timesheet approvals and imports. Reads and `query` calls stay on the Hub proxies.
- Drive buttons from hypermedia links (present, absent, or annotated) instead of the client-side tier comparison added in `contracts/+page.svelte`.
- Add an approvals inbox (the Navigator page already has approvals; reuse or promote it) showing pending tasks for the signed-in approver, with Approve/Reject via `mesh-gateway /approvals`.
- Replace the dev actor picker with identity from `apps/user-identity` (verified token) once available; keep the picker only behind a dev flag. The UI must stop sending `x-actor-tier`.
- UX for 202: show "Awaiting approval by Tier N" with a link to the task.

### Phase 5: Navigator AI and MCP

- Navigator: route all writes through `MeshClient`. Keep reads via the Hub/query path. Remove direct Foundation write calls in `integrationHubClient.ts` and `caiplService.ts`.
- MCP services (`foundation-erp/src/api/mcp`):
  - Move MCP *execution* behind the Mesh. `POST /mcp/functions/:name` on Foundation becomes an internal executor invoked only by the Mesh adapter; external MCP clients call a Mesh-hosted MCP endpoint (`mesh-gateway`) that runs the Authority and Governance pipeline, then delegates execution.
  - Catalog: make `catalog.ts` the single source for `domain`, `entity`, `action`, `riskLevel`, `governanceTag`, and use it to generate the Mesh action mapping and seed/validate Governance rules (a test fails if a catalog function has no governance mapping).
  - Add catalog entries for contracts and projects that are currently missing or UI-only: `o2c_create_contract`, `o2c_approve_contract_version`, `o2c_amend_contract`, `proj_create_project` (Service with contract/WBS), `proj_seed_from_sow` (if exposed), `proj_approve_milestone`, stage-gate and WBS functions.
  - Remove the in-handler `requiredTier` params that make Foundation set authority (e.g. `h2r_create_authority_rule` should be authorised by the Authority Engine, not by Foundation).
  - Return the Mesh 202 approval-task shape from MCP calls so AI agents can report "pending approval" instead of silently failing.
- Update CAIPL/Navigator command mappings to the new MCP names and the 202 behaviour.

### Phase 6: Cut-over, hardening, and cleanup

- Run `shadow` mode in dev/staging and compare Mesh decisions against Foundation's legacy tier checks. Resolve differences by adjusting rules.
- Switch to `enforce`. Remove legacy checks (Phase 3) and the dev-only tier header path.
- Restrict network access so only the Mesh (and internal services) can reach Foundation write endpoints; rotate the shared API key used by the UI.
- Final audit: no client-supplied tier is honoured anywhere; every write has a decision in `governance_decision_log`.

## 5. Testing strategy

- Governance Engine: unit tests per new rule (SoD, value bands, escalation, risk flag), including boundary values and replay determinism.
- Authority Engine: tier derivation for PROJ/INV domains; credential requirements.
- Mesh Gateway: integration tests for the 4-step pipeline per resource: denied by Authority, denied by Governance, 202 approval task, approve (re-check, then execute), reject, self-approval blocked, `shadow` vs `enforce`.
- Foundation: existing integration tests (contract, project, SoW seeding) updated to call through the Mesh adapter or the trusted-actor path; add tests that untrusted `x-actor-tier` is ignored.
- UI: `svelte-check`, plus Playwright flows for create contract, approve (pending then approved by tier-3 user), create Service project (stages seeded).
- MCP: catalog-to-governance coverage test; MCP call through Mesh returns 202 when thresholds apply.
- Regression gate: all suites green except pre-existing, documented failures.

## 6. Documentation updates (after implementation)

- `docs/Architecture v2.md`: correct sections 1 and 6 to reflect actual enforcement flow and the identity trust model.
- `docs/Authority Engine – v1 Design Specification.md`: add PROJ/INV domains, action-to-tier rule model.
- `docs/Governance Engine v1 Design Specification.md`: document new rules, context schemas, and the "creator" SoW condition; note thresholds are data.
- `docs/Mesh Gateway – v3 Design Specification.md`: create/collection routes, actor assertion to adapters, `ENFORCEMENT_MODE`, approvals for new resources.
- `docs/Service Contracts Roadmap.md` and `docs/projects.md` / `docs/Projects-UX.md`: contract lifecycle through the Mesh, approval tasks, SoW-seeded stages.
- `docs/UI-SvelteKit.md`: Mesh proxy routes, 202 handling, approvals inbox, identity.
- `docs/Identity.md` / `IdentityV2.md`: token-to-actor mapping consumed by the Mesh.
- `docs/IdentityRunbook.md`, `docs/OCI-Deployment.md`: network restriction and key rotation steps.
- `docs/FoundationERP v2 - Design.md`: Foundation no longer authorises; trusted-actor behaviour.
- `docs/roadmap.md`, `docs/roadmapNavigatorAI2.md`: update MCP items and mark completed phases.
- `postman/`: update collections to use Mesh paths and add approval-task flows.
- Add an ADR-style note summarising the decision and the migration flags.

## 7. Open decisions

1. **Domain model:** add `PROJ` and `INV` as first-class domains, or fold projects under `O2C` and inventory under `P2P`? (Recommended: add them.)
2. **Identity trust:** Mesh service credential plus asserted-actor header, or signed JWT from `user-identity` verified by Foundation? (Recommended: signed token end to end.)
3. **Thresholds:** confirm contract value bands (10,000 / 100,000) and project/milestone thresholds with Finance.
4. **Approval UX:** where the approvals inbox lives (Navigator page vs dedicated route) and notification mechanism.
5. **MCP hosting:** Mesh-hosted MCP endpoint vs Foundation MCP retained as internal-only executor behind the Mesh. (Recommended: Mesh-hosted, Foundation internal.)
6. **Reads:** keep query/list reads on the Hub path, or also Mesh-filter reads? (Recommended: keep Hub reads, Mesh-filter hypermedia only.)

## 8. Risks and mitigations

- **Breaking existing flows when enforcement turns on:** mitigated by `shadow` mode and phased cut-over.
- **Two sources of truth for tiers during transition:** limit overlap to Phase 3/6 and track removal in the table below.
- **Engine projections lag Foundation events** (tiers or credentials stale): confirm readiness gates (`readinessGate.ts`) and replay behaviour before enforcing.
- **Approval deadlocks** (no eligible approver at required tier): Mesh returns an explicit error; add an admin escalation path.
- **Scope size:** deliver per-domain slices, starting with contracts, then projects, then inventory/H2R.

## 9. Tracking

| # | Work item | Phase | Status |
|---|---|---|---|
| 1 | Confirm open decisions | 0 | Done |
| 2 | Baseline test run and flags | 0 | Done |
| 3 | Authority: PROJ/INV domains and tier rules | 1 | Done |
| 4 | Governance: PROJ/INV schemas and contract/project rules | 1 | Done |
| 5 | Mesh: context builders, create routes, adapter mappings | 2 | Done |
| 6 | Mesh: actor assertion and `ENFORCEMENT_MODE` | 2 | Done |
| 7 | Foundation: hypermedia for contracts/projects/milestones | 3 | Done |
| 8 | Foundation: trusted-actor middleware | 3 | Done |
| 9 | Foundation: remove in-process tier checks | 3/6 | Partial (skipped for Mesh-asserted actors; fallback kept) |
| 10 | UI: Mesh proxy and client, 202 handling | 4 | Done |
| 11 | UI: approvals inbox and identity | 4 | Done |
| 12 | Navigator: writes via Mesh only | 5 | Done |
| 13 | MCP: Mesh-hosted execution, catalog additions, governance coverage test | 5 | Done except coverage test |
| 14 | Shadow comparison then enforce | 6 | Mechanism built; run against real traffic pending |
| 15 | Network restriction and key rotation | 6 | Documented (deployment action pending) |
| 16 | Documentation and Postman updates | 6 | Docs done; Postman collection not yet updated |
