# Foundation ERP

Canonical Foundation ERP kernel for ConstitutionalERP with O2C, P2P, and R2R process surfaces.

## Security Boundary

- HTTPS, TLS policy, cipher policy, optional mTLS, certificate rotation, and HTTP-to-HTTPS redirect or reject are enforced at ingress/reverse proxy.
- Node.js service accepts trusted internal HTTP traffic only.
- Node.js service enforces schema validation, API key/token checks (when passed), domain logic, state transitions, and event emission.
- Governance, authority, and constitutional constraints are enforced by ConstitutionalERP Mesh, not this service.

## Quickstart

1. Install dependencies.
2. Run migrations.
3. Start development server.

```bash
npm install
npm run migrate
npm run dev
```

## Environment

See `.env.example` for defaults.

Local runs load values from `.env` automatically. Keep `postman/FoundationERP.local.postman_environment.json` aligned with your local `API_KEY`, `INGRESS_ID_VALUE`, and port.

## API Roots

- Health: `GET /health`
- O2C Hypermedia: `/api/v1/o2c/*`
- P2P Hypermedia: `/api/v1/p2p/*`
- R2R Hypermedia: `/api/v1/r2r/*`
- Inventory: `/api/v1/inv/*`
- BOM: `/api/v1/bom/*`
- Projects: `/api/v1/projects/*`
- MCP: `/api/v1/mcp/functions` and `/api/v1/mcp/invoke`
- Events feed: `/api/v1/events?limit=100&after=<timestamp>`
- Table query API: `/api/v1/query/tables`, `/api/v1/query/:table?limit=100&offset=0`, `/api/v1/query/:table/:id`

## Required Headers for `/api/v1/*`

- `x-ingress-id: foundation-ingress` (or configured value)
- `x-api-key: <configured API key>`

## Postman And Newman

Integration Hub developers should start with the API guide in `docs/IntegrationHub-API-Guide.md` and use `docs/IntegrationHub-Endpoint-Reference.md` for a shorter implementation reference.

Postman assets are located in `postman/`:

- `postman/FoundationERP.postman_collection.json`
- `postman/FoundationERP.local.postman_environment.json`

Run Postman tests from CLI with Newman:

```bash
npm run build
npm run migrate
npm start
```

`npm start` loads local settings from `.env`, including `PORT`, `API_KEY`, and `INGRESS_ID_VALUE`.

In a second terminal:

```bash
npm run test:postman
```

Newman writes reports to `reports/newman/`:

- `results.json`
- `results.xml` (JUnit)

Optional overrides when your local server is not on defaults:

```bash
POSTMAN_BASE_URL=http://localhost:3001 POSTMAN_API_KEY=change-me POSTMAN_INGRESS_ID=foundation-ingress npm run test:postman
```
