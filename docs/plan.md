# Plan: Monorepo Migration to constitutional-erp

## TL;DR
Migrate two separate git repos plus the ungit-tracked root orchestration folder into one private GitHub repo (`constitutional-erp`). Add npm workspaces + Turborepo at the root for unified install/build/test, update hardcoded paths in orchestration scripts, add Docker Compose for full-stack local dev, and replace the disabled single-service CI with a path-filtered multi-service pipeline.

---

## Target layout

```
constitutional-erp/                    ← new repo root
├── .github/workflows/ci.yml
├── services/
│   ├── foundation-erp/               ← was ConstitutionalERP-FoundationERP
│   ├── authority-engine/
│   ├── governance-engine/
│   ├── mesh-gateway/
│   ├── event-processor/
│   ├── process-graph/
│   ├── integration-hub/
│   └── navigator-ai/
├── apps/
│   ├── ui-sveltekit/                 ← was ConstitutionalERP-UI-SvelteKit
│   └── navigator-repl/
├── infra/
│   ├── compose/docker-compose.yml
│   └── scripts/  (run-systems.ps1, run-full-postman-cycle.ps1, truncate-logs.ps1, *.cmd)
├── postman/                          ← root Postman/Newman scripts (build-unified, run-newman)
├── packages/                         ← empty, reserved for shared libs
├── docs/                             ← Design/ folder content
├── package.json                      ← root workspace manifest
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── .gitignore
```

---

## Phase 1 — Git history migration (no code changes)

1. Clone the new empty repo locally.
2. Add `ConstitutionalERP-FoundationERP` as a remote; fetch; merge with `--allow-unrelated-histories`; move files into `services/foundation-erp/`; commit.
3. Add `ConstitutionalERP-ConstitutionalLayer` as a remote; fetch; merge; move each subdirectory (`authority-engine`, `governance-engine`, `mesh-gateway`, `event-processor`, `process-graph`, `integration-hub`, `navigator-ai`, `ConstitutionalERP-UI-SvelteKit`, `navigator-repl`) to target paths; commit.
4. Copy root orchestration files from `d:\Projects\ConstitutionalERP\` (run-systems.ps1/cmd, run-full-postman-cycle.ps1/cmd, truncate-logs.ps1/cmd, postman/, Design/, `-- SQLite.sql`, etc.) into the monorepo; commit.
5. Push to `constitutional-erp` on GitHub.
6. Archive old repos on GitHub (set to read-only).

## Phase 2 — Workspace tooling

7. Add root `package.json` with `"workspaces"` listing all `services/*` and `apps/*`.
8. Add `turbo.json` with pipeline: `build` (depends on upstream), `test`, `lint`, `migrate`, `dev`.
9. Add `tsconfig.base.json` with shared compiler options (target, strict, paths, rootDir/outDir conventions).
10. Update each service's `tsconfig.json` to `extends "../../tsconfig.base.json"` (or `"../.."`).
11. Run `npm install` at root to generate unified `package-lock.json`.

## Phase 3 — Path updates in orchestration scripts

12. Update `infra/scripts/run-systems.ps1`: change all service paths from `FoundationERP\ConstitutionalERP-FoundationERP` → `services\foundation-erp`, and `ConstitutionalLayer\ConstitutionalERP-ConstitutionalLayer\<svc>` → `services\<svc>` / `apps\<name>`.
13. Update `postman/build-unified-postman.js`: same path rewrites for all collection/env file references.
14. Update `postman/newman/run-newman.js`: same path rewrites.
15. Update `.cmd` wrappers if they hardcode paths.
16. Add root `npm` scripts: `"dev": "turbo dev"`, `"build": "turbo build"`, `"test": "turbo test"`, `"lint": "turbo lint"`, `"migrate": "turbo migrate"`, `"start:all": "node infra/scripts/run-systems.js start"` (or keep PS1).

## Phase 4 — Docker Compose (full-stack local dev)

17. Add `Dockerfile` for each of the 8 backend services (multi-stage: build TypeScript → run node dist/).
18. Add `Dockerfile` for `apps/ui-sveltekit` (build with adapter-node → serve).
19. Add `infra/compose/docker-compose.yml` with all 9 services, port mappings matching existing ports, depends_on ordering, volume mounts for SQLite data, and env_file references.
20. Add `.env.compose.example` with compose-layer env defaults.

*Steps 17-19 can run in parallel per service.*

## Phase 5 — CI pipeline

21. Add `.github/workflows/ci.yml` replacing the current disabled stub.
    - Trigger: push to any branch, PR to main.
    - Detect changed service paths (dorny/paths-filter or tj-actions/changed-files).
    - Matrix job per changed service: install → lint → test → build.
    - Upload Newman reports as artifacts.
    - On main branch only: optional Docker build step per changed service.
22. Add `.github/workflows/release.yml` (stub): manually triggered, builds and tags images.

*Steps 21 and 22 can be done in parallel.*

## Phase 6 — Verification

23. Local: `npm install` at root installs all workspaces.
24. Local: `turbo build` compiles all services.
25. Local: `turbo test` runs all test suites.
26. Local: compose `up` brings full stack; `/health` passes for all ports.
27. Local: `postman/build-unified-postman.js` + Newman suite passes.
28. CI: push a branch; confirm path-filtered matrix runs only affected services.

---

## Relevant files

- `d:\Projects\ConstitutionalERP\run-systems.ps1` — service paths table to rewrite (step 12)
- `d:\Projects\ConstitutionalERP\postman\build-unified-postman.js` — path rewrites (step 13)
- `d:\Projects\ConstitutionalERP\postman\newman\run-newman.js` — path rewrites (step 14)
- `d:\Projects\ConstitutionalERP\FoundationERP\ConstitutionalERP-FoundationERP\.github\workflows\ci.yml` — disabled stub to replace (step 21)
- Each service `tsconfig.json` — extend shared base (step 10)
- `d:\Projects\ConstitutionalERP\ConstitutionalLayer\ConstitutionalERP-ConstitutionalLayer\.gitignore` — consolidate into root (phase 1)

---

## Decisions / Scope

- History migration: simple merge + move (no git-filter-repo); history is preserved via --allow-unrelated-histories + move commit.
- Package manager: npm workspaces (no new tool; all services already on npm/package-lock.json).
- Task orchestrator: Turborepo (thin layer, works with npm workspaces, no vendor lock-in).
- Services remain independent processes (no runtime merging).
- navigator-repl treated as CLI app under `apps/`.
- `.venv` Python venv in ConstitutionalLayer: excluded via .gitignore, not migrated.
- Design/ docs: moved to `docs/` in monorepo.
- SQLite db files: not migrated (excluded by .gitignore), each developer runs `migrate` locally.
- Capacitor and OAuth: out of scope for this migration.
- Production Kubernetes/Helm: out of scope; Docker Compose covers Phase 4; Helm is flagged as future work.

## Further Considerations

1. navigator-ai requires Azure OpenAI credentials; CI workflow should skip navigator-ai tests unless secrets are available (use `if: env.AZURE_OPENAI_KEY != ''`).
2. The `.venv` directory in ConstitutionalLayer is a leftover artifact — Python is not used; exclude via `.gitignore`, nothing to migrate.
3. SQLite per-service databases work locally and in compose (volumes); for production they will need to move to a hosted DB — flag this as a future migration step.
