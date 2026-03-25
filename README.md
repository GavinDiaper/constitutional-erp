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

## API Roots

- Health: `GET /health`
- O2C Hypermedia: `/api/v1/o2c/*`
- P2P Hypermedia: `/api/v1/p2p/*`
- R2R Hypermedia: `/api/v1/r2r/*`
- MCP: `/api/v1/mcp/functions` and `/api/v1/mcp/invoke`
- Events feed: `/api/v1/events?limit=100&after=<timestamp>`

## Required Headers for `/api/v1/*`

- `x-ingress-id: foundation-ingress` (or configured value)
- `x-api-key: <configured API key>`

## Postman And Newman

Postman assets are located in `postman/`:

- `postman/FoundationERP.postman_collection.json`
- `postman/FoundationERP.local.postman_environment.json`

Run Postman tests from CLI with Newman:

```bash
npm run build
npm run migrate
npm start
```

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
