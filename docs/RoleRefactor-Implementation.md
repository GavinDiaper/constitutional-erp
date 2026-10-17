# Role Refactor – As-Built Notes, Rollout and Runbook

Companion to [roleRefactor.md](roleRefactor.md) (the plan). This records what was implemented, the decision (ADR), configuration, rollout steps and known gaps.

## 1. Decision (ADR)

Authority, governance and enforcement are separated as designed:

| Component | Role |
|---|---|
| Authority Engine | Who can do what. Derives effective tier; per-action tier rules (`authority_action_rule`) plus amount rules. |
| Governance Engine | Is the action permissible. Pure rule evaluator (SoD, value thresholds, risk). Never calls Foundation. |
| Mesh Gateway | The enforcement point for writes: Authority, then Governance, then approval task (202) or execution. |
| Foundation ERP | System of record. Executes transitions; trusts a Mesh-signed actor; does not decide who may act. |

Domains `PROJ` and `INV` are first-class in all three services. Contract and project thresholds are **data** (rules), not code.

## 2. What changed

- **Authority** (migration `006`): PROJ/INV domains, `authority_action_rule`, new principals; required tier = max(amount rule, action rule). The FinancialApproval credential check is skipped for `resourceType = contract`.
- **Governance** (migration `004`): `SOD-GLOBAL-001` (no self-approval), `CON-APPROVAL-001/002` (>10k tier 3, >100k tier 4), `CON-RISK-*`, `PROJ-CANCEL-FORCE-001`, `PROJ-RISK-001`; `ContextEquals` condition; PROJ/INV context schemas.
- **Mesh**: `evaluatePipeline` (allow/approval/deny; approval is no longer a 403); create route `POST /mesh/:adapter/:domain/:resource`; MCP route `POST /mesh/:adapter/mcp/:functionName`; approver re-evaluated on approval (SoD applies to the approver); never forwards a client tier; HMAC-signed actor assertion; `ENFORCEMENT_MODE=shadow|enforce`.
- **Foundation**: verifies the Mesh assertion; unsigned writes to `/o2c/contracts`, `/projects` and `/mcp/invoke` are refused (401 `mesh_assertion_required`) once a secret is set; in-process tier checks are skipped for Mesh-asserted actors; hypermedia `_links` for contracts and projects; `POST /o2c/contracts/:id/approve`; MCP catalog gains contract create/amend/approve.
- **UI**: all contract/project writes go via `/api/mesh/*`; direct Hub write proxies removed; 202 shown as "pending approval"; `/approvals` inbox; actor picker has the new principals.
- **Navigator**: writes through `MeshClient` (`IntegrationHubClient.executeAction` delegates to the Mesh when a domain is supplied).

- **Configurable thresholds**: Governance table `governance_parameter` (migration `005`) holds `contract.tier3_threshold` (10000) and `contract.tier4_threshold` (100000). Rules CON-APPROVAL/RISK-* reference them via `AmountGreaterThan.param`. Change with `PUT /governance/parameters/:key` (`{value, updatedBy}`); `GET /governance/parameters` lists them. Foundation's `CONTRACT_TIER3_THRESHOLD` / `CONTRACT_TIER4_THRESHOLD` only feed UI hints.
- **Governed operations (`/mesh/:adapter/ops/*`)**: inventory adjustments/cost updates (tier 2/3), H2R vendor/employee cost rates and authority rules (tier 4), timesheet import/commit (tier 4), project milestone/change-request approval (tier 2) and other project sub-writes. Mapped by `governedOperations.ts`; Authority migration `007` holds the rules and `principal.inv-tier1..3`, `principal.h2r-tier4`. These paths are Mesh-only in Foundation.
- **Governance context persisted**: the Mesh sends a signed `x-mesh-governance` header (HMAC covers `id|tier|ts|governance`); Foundation stores it in `governance_json.mesh` on every event.
- **Identity hardening**: a verified JWT overrides client actor headers (actor = `h2r_employee_id || identity_id`, client tier discarded); `MESH_REQUIRE_JWT=true` returns 401 for unauthenticated `/mesh/*` (except `/mesh/ready`). `GET /mesh/approvals` uses the authenticated actor and returns 403 `actor_mismatch` for a different `actorId`.
- **Production**: Foundation refuses to start with `NODE_ENV=production` and no `MESH_ASSERTION_SECRET`.
- **Postman**: Mesh folder "60 – Contracts, Projects & Governed Operations" and Governance "40 - Governance Parameters"; unified collection rebuilt.

## 3. Configuration

| Variable | Where | Purpose |
|---|---|---|
| `MESH_ASSERTION_SECRET` | Mesh and Foundation (same value) | HMAC signing/verification of `x-actor-id`, `x-actor-tier`, `x-mesh-actor-ts`. Unset = legacy header trust (dev only). |
| `MESH_REQUIRE_JWT` | Mesh | `true` rejects unauthenticated `/mesh/*` requests. |
| `CONTRACT_TIER3_THRESHOLD`, `CONTRACT_TIER4_THRESHOLD` | Foundation | Hint/fallback only; authoritative values are Governance parameters. |
| `ENFORCEMENT_MODE` | Mesh | `shadow` logs `MeshShadowDecision` without blocking; `enforce` (default) blocks. |
| `MESH_GATEWAY_URL`, `MESH_GATEWAY_API_KEY` | UI, Navigator | Mesh location. Defaults: UI `http://localhost:4003/api/v1`, Navigator `http://localhost:4003`. |

## 4. Rollout

1. Run migrations (authority 006, governance 004, mesh 003).
2. Deploy Mesh with `ENFORCEMENT_MODE=shadow`; review `MeshShadowDecision` rows in `mesh_decision_log` against real traffic.
3. Set `MESH_ASSERTION_SECRET` on Mesh and Foundation; switch Mesh to `enforce`.
4. Restrict network access so only the Mesh can reach Foundation write endpoints (security group / private network).
5. **Key rotation:** generate a new secret, deploy to Foundation and Mesh in the same window (the timestamp window is 5 minutes), restart both, then retire the old value.

## 5. Known gaps (follow-ups)

- Foundation GET read checks (rate and timesheet import listings) still use header-derived tiers; spoofable without JWT/secret.
- Hub POST proxies outside the ops table (bom, skus, organizations, bootstrap, process/action, p2p, o2c) are not Mesh-governed.
- With no `MESH_ASSERTION_SECRET` (dev only), Foundation keeps legacy header trust and in-process tier checks.
- The UI does not yet perform a JWT login; only the Mesh honours JWTs.
- Shadow-mode review, network restriction and per-environment secrets are deployment actions.
- Pre-existing failures: foundation-erp "Timesheet task locking…" and navigator-ai "promptCreate purchase-order intent…" (unverified whether pre-existing).

## 6. Tests

`authority-engine` 4, `governance-engine` 21, `mesh-gateway` 21; foundation adds `mcp-catalog-governance.test.ts` (catalog-to-governance coverage) (its `npm test` now migrates a throwaway `.test-mesh.db` so stale pending tasks cannot leak between runs), `foundation-erp` 64 pass plus the one pre-existing failure.
