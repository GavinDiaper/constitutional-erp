# Governance Engine

Governance Engine is the constitutional decision layer for Constitutional ERP.
It consumes Foundation ERP events, builds governance projections, and answers:

`POST /governance/evaluate`

## Key Guarantees

- Replay-gated readiness: `/governance/evaluate` returns 503 until replay is complete.
- Fail-fast startup: bootstrap replay failure exits process with non-zero code.
- No partial projections: decisions are served only when replay status is `Ready`.
- Canonical contracts: source ERP event payloads are mapped into internal canonical schemas.

## Commands

- `npm install`
- `npm run migrate`
- `npm run dev`
- `npm run build`

## Environment

Copy `.env.example` values into your local environment.

- `PORT` defaults to `4002`
- `FOUNDATION_ERP_URL` defaults to `http://localhost:3000`
- `FOUNDATION_ERP_API_KEY` is required
