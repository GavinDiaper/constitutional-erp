# Authority Engine

Authority Engine is the first constitutional service for Constitutional ERP.
It consumes Foundation ERP events, builds an authority projection, and answers:

`POST /authority/check`

## Key Guarantees

- Replay-gated readiness: `/authority/check` returns 503 until replay is complete.
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

- `PORT` defaults to `4001`
- `FOUNDATION_ERP_URL` defaults to `http://localhost:3000`
- `FOUNDATION_ERP_API_KEY` is required
