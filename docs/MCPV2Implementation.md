# MCP v2: Technical Design & Implementation Plan

Status: approved design, not yet implemented. Supersedes the ad-hoc MCP catalog/`switch` dispatcher in `services/foundation-erp/src/api/mcp`.

## 1. Current state

| Piece | Location | Gap |
|---|---|---|
| Function catalog (~129 entries, 7 domains, risk level and governance tag) | `services/foundation-erp/src/api/mcp/catalog.ts` | Few entries have an `inputSchema`. No read/write flag, no output schema. |
| `GET /functions`, `POST /invoke` | `services/foundation-erp/src/api/mcp/mcp.routes.ts` | One large `switch`, so catalog and dispatcher can drift. No authority check or dry-run. Read functions missing for most entities. |
| Generic read API `GET /query/:table` (~90 whitelisted tables) | `services/foundation-erp/src/api/query.routes.ts` | Paging only. No filtering or name search. |
| Hypermedia `links` with `mcpFunction` and `governance.{riskLevel, requiredTier}` | `services/foundation-erp/src/api/hypermedia/*.routes.ts` | State-valid next steps exist, but the required tier is static and never compared to the caller. |
| Authority engine: `/authority/check`, `/eligible-approvers` | `services/authority-engine` | Not wired into next-step discovery. |
| Governance engine: `/governance/evaluate` (EXECUTE / REQUEST_APPROVAL / REJECT) | `services/governance-engine` | Not wired into discovery. |
| Navigator `nextSteps`, `rank`, `actions` | `services/navigator-ai/src/services/navigatorService.ts` | Lives in navigator-ai with a hard-coded `nextStepPlaybook`. The MCP layer should own this. |

The hypermedia links already map each next step to an MCP function and a governance tier. This design promotes them into the MCP contract and adds authority-aware evaluation.

## 2. Principles

1. **One source of truth.** Each function is a single registry entry (schema, handler, read/write flag, risk, governance tag). Catalog and dispatcher are generated from it.
2. **The model proposes, the server decides.** Every call runs the same authority and governance gates regardless of caller.
3. **Reads are free, writes are gated.** The model may loop over reads. Writes return `PROPOSED` unless low-risk and policy allows, or a human has confirmed.
4. **Names in, IDs out.** Only `find_*` read tools resolve names. Write tools take IDs only.
5. **Standard protocol.** Add JSON-RPC MCP (`tools/list`, `tools/call`) alongside the existing REST surface.

## 3. Architecture

```
AI layer (later) ──tools/list, tools/call──► MCP Gateway (foundation-erp /api/v1/mcp)
 (Ollama/OpenAI loop)                         ├─ Registry (schemas, handlers, flags)
                                              ├─ Read tools (get/list/find/describe)
                                              ├─ Next-steps resolver ─► PGE links + state guards
                                              │                      ─► Authority engine (tier/eligibility)
                                              │                      ─► Governance engine (mode)
                                              ├─ Write tools ─► gate (authority + governance) ─► domain service
                                              └─ Audit: event log + governance_decision_log
```

Location decision: the gateway stays in foundation-erp (data and services live there). navigator-ai and the integration hub call it; no second copy.

## 4. Registry contract

```ts
interface McpTool {
  name: string;                 // h2r_create_assignment
  domain: Domain; entity: string; action: string;
  kind: "read" | "write";
  description: string;          // model-facing; states preconditions
  inputSchema: JsonSchema;      // generated from zod
  outputSchema?: JsonSchema;
  riskLevel: "Low" | "Medium" | "High";
  governanceTag: string;
  stateGuard?: { from: string[]; to?: string };
  handler(input, ctx): Promise<unknown>;
}
```

- Schemas are zod, converted with `zod-to-json-schema`. `registry.get(name).handler` replaces the `switch`.
- `x-lookup` hints point at a real read tool, e.g. `x-lookup: "h2r_find_employee"`.
- Drift test: every catalog entry has a handler and schema, and every hypermedia `mcpFunction` exists in the registry.

## 5. Read tools

Per entity, across o2c, p2p, r2r, h2r, inv, bom, proj (derived from the `query.routes.ts` table map plus per-entity config):

| Tool | Purpose |
|---|---|
| `<domain>_get_<entity>(id)` | Entity with current state and key children (e.g. lines). |
| `<domain>_list_<entity>(filters, state?, limit, cursor)` | Filterable, paged. Filters are whitelisted columns. |
| `<domain>_find_<entity>(text)` | Name/title search returning `{id, label, state, score}`. Returns candidates on ambiguity; never guesses. |
| `<domain>_describe_<entity>()` | State model, allowed actions, required fields. |

Cross-cutting: `erp_list_tables`, `erp_get_history(entity, id)`, `erp_get_approvals(entity?, id?)`, `authority_get_profile(employeeId)`, `authority_list_eligible_approvers(domain, tier)`, `gov_get_parameters`.

Rules: read-only parameterised SQL with whitelisted columns; limit capped at 100; lean projections (`fields=` for more); domain-level visibility initially (finer rules later); secrets/PII excluded.

## 6. Next-steps tools

`erp_get_next_steps(entityType, entityId)` returns:

```json
{
  "entity": {"type": "Requisition", "id": "...", "state": "Submitted"},
  "actor": {"id": "...", "tier": 2, "domain": "P2P"},
  "steps": [
    {"tool": "p2p_approve_requisition", "kind": "write", "risk": "Medium",
     "availability": "AVAILABLE | NEEDS_APPROVAL | BLOCKED_AUTHORITY | BLOCKED_STATE",
     "governanceMode": "EXECUTE | REQUEST_APPROVAL | REJECT",
     "requiredTier": 2, "actorTier": 2,
     "reasons": ["..."], "eligibleApprovers": ["emp_..."],
     "inputHints": {"requisitionId": "..."}}
  ]
}
```

Pipeline per candidate tool:
1. **State guard** from the registry `stateGuard`, cross-checked with PGE transition links. Mismatch gives `BLOCKED_STATE` with a reason (blocked steps stay in the response so the model can explain).
2. **Authority**: `/authority/check` with the real actor, action, domain and context (amount, risk). The static hypermedia `requiredTier` is only a fallback.
3. **Governance**: `/governance/evaluate`. EXECUTE gives `AVAILABLE`; REQUEST_APPROVAL gives `NEEDS_APPROVAL` plus `eligibleApprovers`; REJECT gives `BLOCKED_AUTHORITY`.
4. **Input hints**: pre-fill IDs from the entity; for child-creating actions return required fields from the schema.

Also: `erp_get_available_creates(domain)` (creatable entities and prerequisites, replacing `nextStepPlaybook`) and `erp_get_my_work()` (pending approvals the actor can resolve).

Ranking: the MCP layer returns facts; ranking belongs to the new AI layer.

## 7. Write path and invoke loop

Loop (in the AI layer): `model -> tool_call -> POST /invoke (or tools/call) -> result -> model`, max ~8 steps per turn.

Inside `/invoke` for writes:
1. Validate input against the zod schema (400 with `fieldErrors` the model can use to retry).
2. Check the state guard.
3. Run authority and governance.
4. EXECUTE with Low risk runs the handler. Medium/High (or no confirmation) returns `{status: "PROPOSED", preview, confirmToken}`. The token is issued by a human action in the UI, never by the model. Low-risk calls auto-confirm.
5. REQUEST_APPROVAL creates an approval request via the existing Navigator approvals flow. REJECT returns reasons.
6. Audit everything (`governance_decision_log` plus a domain event with actor and `viaMcp: true`).

Additions: `dryRun` (gates only, returns preview) and `idempotencyKey` (safe retries). Errors are structured: `{code, message, fieldErrors[], hint}`.

The actor always comes from the authenticated request (`req.actor`), never from tool arguments.

## 8. Protocol surface

- Keep `GET /functions` and `POST /invoke` for the UI and hub.
- Add `POST /api/v1/mcp/rpc` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`).
- `tools/list` accepts `?domain=` and `?entity=` so the AI layer can load 10-15 tools per turn (important for small local models).
- The integration hub's `mcpCatalog.ts` stays a thin proxy.

## 9. Security

- Writes always gated; reads domain-scoped.
- Per-actor rate limits and row caps.
- Tool results are data, never instructions. Writes require server-side confirmation and cannot be talked past.
- Tests assert a low-tier actor can never reach `AVAILABLE` on a higher-tier action.

## 10. Implementation plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0. Foundation | Registry type, zod to JSON Schema, catalog and dispatcher generated from registry, drift test. | `/invoke` behaviour unchanged; existing tests pass. |
| 1. Reads | get/list/find/describe generators: H2R first (name lookup), then P2P and O2C, then R2R, INV, BOM, PROJ. Cross-cutting history, approvals, authority-profile tools. | Every whitelisted table reachable by a read tool; ambiguous names return candidates. |
| 2. Write schemas | `inputSchema`, `stateGuard`, `outputSchema` for all write functions, migrated domain by domain from the `switch`. | No write function without a schema; contract test green. |
| 3. Next-steps | `erp_get_next_steps`, `erp_get_available_creates`, `erp_get_my_work`. | Table-driven tests of entity state x actor tier, incl. requisition approve / add-lines. |
| 4. Gated writes | Authority and governance gate in `/invoke`; PROPOSED/confirm token, dryRun, idempotency, approval-request integration. | Low-tier actor blocked; medium-risk returns preview; confirmed call executes exactly once. |
| 5. Protocol | JSON-RPC endpoint, `tools/list` filters, per-domain tool budget. | A standard MCP client can list and call tools. |
| 6. Hardening and eval | Rate limits, audit review, error-shape polish, loop harness against Ollama (Qwen 3B/7B) with scenarios: "assign Alice to Analyst", "approve REQ-12", "what can I do with this PO?". | Agreed pass-rate before the new AI layer starts. |
| 7. Docs | Update `FoundationERP v2 - Design.md` and `NavigatorLocalLLM.md`. | |

Phases 0-4 are the core; 5-6 make it consumable by the AI layer.

## 11. Decisions (agreed)

1. Gateway lives in foundation-erp; other services call it.
2. Only `find_*` tools resolve names; writes are ID-only.
3. Confirmation: auto-confirm for Low risk; UI-issued token for Medium/High.
4. MCP returns facts; ranking is done by the new AI layer.
5. Reads restricted at domain level initially; finer rules later.

## 12. Risks

- The `switch` migration is large; migrate incrementally with the drift test as a safety net.
- Small local models may choose tools poorly when many are offered; mitigated by `tools/list` filters and `describe_*` tools.
- Authority and governance calls add latency to next-steps; batch per entity and cache per request.
- Static hypermedia `requiredTier` values may disagree with the authority engine; the engine becomes the source of truth and static values are removed after Phase 3.
