## Roadmap NavigatorAI v2

### Purpose
Deliver Navigator v1.1 and v2 capabilities that close current AI execution gaps:
- Prompt-driven entity creation from natural language with constitutional safety.
- History-aware next-step recommendations across process flows.
- Hardening for explainability, governance lifecycle, and testability.

### Current Baseline
Navigator currently supports:
- Hypermedia interpretation and action ranking.
- Governance-aware decision and execution routing.
- Explain and simulate endpoints.
- CEP event emission and local SQLite logging.

Primary gaps:
- No natural-language intent-to-create pipeline.
- History fetched but not materially used in ranking/planning prompts.
- Simulation depth is limited.
- Approval lifecycle tracking is incomplete.
- Automated test coverage is sparse.

### Roadmap Phases

### Phase 1 - API and Contracts Foundation
Objective: Introduce explicit API surface for prompt create and next-step reasoning.

Scope:
1. Add prompt-create contracts (intent input, validated operation output, clarification-needed output).
2. Add next-step recommendation contracts (suggestion, confidence, rationale, prerequisites).
3. Add API routes for prompt-create and next-step recommendations.
4. Preserve existing structured create endpoint for backward compatibility.

Deliverables:
- New request/response types in navigator contracts.
- New task-oriented endpoints in navigator routes.
- Compatibility retained for existing UI/REPL workflows.

### Phase 2 - Prompt-Driven Entity Creation
Objective: Convert natural-language create requests into validated create operations.

Scope:
1. Implement intent interpreter mapping NL prompts to supported operations.
2. Add operation-specific schema templates and value normalization rules.
3. Implement LLM extraction into strict JSON plus schema validation.
4. Add clarification-required flow when required fields are missing/ambiguous.
5. Execute through existing createEntity path only after validation passes.

Example target behavior:
- Input: create a new supplier in UAE named Gulf Trading with NET45 terms.
- Output: validated create-supplier operation with normalized payload and explicit execution result.

Deliverables:
- Prompt-create service and orchestrator wiring.
- Safe validation gate before execution.
- Audit records for intent, extracted payload, and validation outcome.

### Phase 3 - History-Aware Next-Step Recommender
Objective: Propose logical process progression using event history and process playbooks.

Scope:
1. Add domain playbook rules for cross-aggregate progression.
2. Build history feature extractor from CEP events.
3. Extend recommendation prompt/context with distilled milestones.
4. Return ranked next steps with confidence, rationale, and prerequisites.
5. Constrain executable recommendations by canonical hypermedia and governance.

Example target behavior:
- After supplier creation, recommend create-requisition or create-purchase-order path based on actor role, domain state, and event trail.

Deliverables:
- Next-step recommendation service.
- History-aware suggestion endpoint.
- Recommendation traces persisted for auditability.

### Phase 4 - UI and REPL Adoption
Objective: Expose new capabilities consistently across Canvas-style UI and REPL.

Scope:
1. Add Prompt Create panel to navigator UI with clarification UX.
2. Add Next Step panel showing ranked follow-on recommendations.
3. Add REPL commands for prompt-create and next-step retrieval.
4. Retain manual create forms as fallback and control path.

Deliverables:
- Updated UI API client and page wiring.
- Updated REPL command routing and client calls.
- Side-by-side parity between UI and REPL workflows.

### Phase 5 - Hardening, Safety, and Quality
Objective: Make behavior deterministic, testable, and auditable for release confidence.

Scope:
1. Persist prompt/recommendation traces in SQLite/navlog.
2. Add deterministic unit tests using mocked LLM responses.
3. Add integration tests for end-to-end prompt-create and next-step flows.
4. Add negative-path tests (unsupported intents, missing fields, ambiguity).
5. Add telemetry for recommendation quality and execution outcomes.

Deliverables:
- Automated regression coverage.
- Safety and non-execution guarantees on ambiguous requests.
- Metrics foundation for future replay-learning loop.

### Milestone View
M1: Contracts and endpoints live.
M2: Prompt create works with validation and clarification.
M3: History-aware next-step recommendations live.
M4: UI and REPL support both capabilities.
M5: Test and observability hardening complete.

### Scope Boundaries
Included:
- Prompt-driven creation for currently supported create operations.
- History-aware recommendation for logical next steps.
- Human-in-the-loop confirmation before execution.

Excluded:
- Fully autonomous cross-aggregate execution without explicit confirmation.
- Self-optimizing replay-learning loop (deferred to later v2 optimization track).

### Risk Controls
1. Feature flags:
- PROMPT_CREATE_ENABLED
- NEXT_STEP_RECOMMENDER_ENABLED

2. Guardrails:
- Strict schema validation before create execution.
- Clarification-required responses instead of unsafe defaults.
- Governance and authority checks remain mandatory.

3. Determinism:
- Deterministic LLM mode for tests and CI.
- Snapshot tests for recommendation structure and explanation outputs.

### Verification Checklist
1. Prompt create can produce validated supplier creation from natural language.
2. Ambiguous prompts do not execute and return actionable clarification.
3. After creation, next-step recommendation endpoint proposes logical follow-on actions.
4. Recommendations include rationale and confidence.
5. Existing rank/decide/execute paths remain backward compatible.
6. All new flows are covered by unit and integration tests.

### Target Files
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-ai/src/contracts/navigatorTypes.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-ai/src/api/navigator.routes.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-ai/src/services/navigatorService.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-ai/src/services/ranker.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-ai/src/domain/stores/navigatorStore.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-repl/src/client/navigatorClient.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/navigator-repl/src/index.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/ConstitutionalERP-UI-SvelteKit/src/lib/api/navigator.ts
- d:/Projects/ConstitutionalERP/ConstitutionalLayer/ConstitutionalERP-ConstitutionalLayer/ConstitutionalERP-UI-SvelteKit/src/routes/navigator/+page.svelte