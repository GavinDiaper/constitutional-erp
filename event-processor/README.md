# Constitutional Event Processor

Canonical ingestion and ledger service for Constitutional ERP.

## Scope

- Poll Foundation ERP, Mesh Gateway, Authority Engine, and Governance Engine event feeds
- Normalize upstream rows into a canonical ledger event shape
- Validate and deduplicate before append
- Expose query and replay APIs over the canonical ledger

## Commands

- `npm run dev`
- `npm run migrate`
- `npm run lint`
- `npm run test`

## Environment

Copy `.env.example` values into your local environment before running the service.
