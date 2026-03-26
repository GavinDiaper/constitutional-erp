# Foundation ERP Integration Hub API Guide

## Purpose

This document is intended for developers building or configuring Integration Hub solutions that need to interact with the Foundation ERP API.

Foundation ERP is a canonical ERP kernel that exposes a stable HTTP API for four core enterprise process areas:

- Order to Cash (O2C)
- Procure to Pay (P2P)
- Record to Report (R2R)
- H2R (Hire to Retire)

The API is designed for:

- system-to-system orchestration
- workflow progression across canonical ERP states
- operational data retrieval
- event polling for downstream integration
- validation and testing using Postman

It is not positioned as a full production ERP. It is a consistent integration surface and reference implementation that downstream platforms can automate against.

## What The Application Provides

Foundation ERP exposes four API styles:

### 1. Hypermedia business APIs

These are the main business endpoints under `/api/v1/o2c`, `/api/v1/p2p`, `/api/v1/r2r`, and `/api/v1/h2r`.

They support:

- entity creation
- entity retrieval
- lifecycle transitions
- hypermedia `_links` for next valid actions

This is the preferred surface for orchestrating business workflows.

### 2. Event feed API

The events endpoint provides a polling-based feed of emitted domain events.

Use it when Integration Hub needs to:

- detect business changes
- trigger downstream processing
- maintain local projections
- replay recent activity since a checkpoint

Endpoint:

- `GET /api/v1/events?limit=100&after=<timestamp>`

### 3. Table query API

The query API exposes read-only access to whitelisted Foundation ERP tables.

Use it when Integration Hub needs:

- direct operational reads
- troubleshooting support
- reconciliation checks
- table-level inspection for testing and support

Endpoints:

- `GET /api/v1/query/tables`
- `GET /api/v1/query/:table?limit=100&offset=0`
- `GET /api/v1/query/:table/:id`

### 4. MCP function API

The MCP surface exposes named business functions and a function invocation endpoint.

Use it when an integration layer wants to call semantic actions rather than raw resource URLs.

Endpoints:

- `GET /api/v1/mcp/functions`
- `POST /api/v1/mcp/invoke`

## Security Model

All `/api/v1/*` endpoints require both:

- `x-api-key`
- `x-ingress-id`

Default local values are:

- API key: `change-me`
- ingress id: `foundation-ingress`

Health does not require authentication:

- `GET /health`

Example authenticated headers:

```http
x-api-key: change-me
x-ingress-id: foundation-ingress
Content-Type: application/json
```

## Local Defaults

For local development, the checked-in defaults are:

- Base URL: `http://localhost:3000`
- API key: `change-me`
- Ingress id: `foundation-ingress`

These values are aligned across:

- `.env`
- `postman/FoundationERP.local.postman_environment.json`

## API Root Summary

### Health

- `GET /health`

### O2C

- `/api/v1/o2c/customers`
- `/api/v1/o2c/quotes`
- `/api/v1/o2c/orders`
- `/api/v1/o2c/invoices`
- `/api/v1/o2c/payments`

### P2P

- `/api/v1/p2p/suppliers`
- `/api/v1/p2p/requisitions`
- `/api/v1/p2p/purchase-orders`
- `/api/v1/p2p/goods-receipts`
- `/api/v1/p2p/supplier-invoices`
- `/api/v1/p2p/ap-payments`

### R2R

- `/api/v1/r2r/accounts`
- `/api/v1/r2r/fiscal-years`
- `/api/v1/r2r/fiscal-periods`
- `/api/v1/r2r/journals`
- `/api/v1/r2r/trial-balance/:fiscalPeriodId`

### H2R

- `/api/v1/h2r/employees`
- `/api/v1/h2r/positions`
- `/api/v1/h2r/assignments`
- `/api/v1/h2r/credentials`
- `/api/v1/h2r/authority-rules`

### Events

- `/api/v1/events`

### Table Queries

- `/api/v1/query/*`

### MCP

- `/api/v1/mcp/functions`
- `/api/v1/mcp/invoke`

## Business Capability Summary

### O2C capabilities

Foundation ERP supports the core O2C progression:

- create customer
- create quote
- add quote line
- send quote
- accept quote
- convert accepted quote to sales order
- confirm order
- allocate order
- ship order
- generate invoice
- post invoice
- register payment
- apply payment
- reconcile payment

Typical integration use cases:

- CRM or commerce platform sends commercial demand into Foundation ERP
- Integration Hub advances documents through business states
- downstream billing or collections systems read invoice and payment state

### P2P capabilities

Foundation ERP supports the core P2P progression:

- create supplier
- create requisition
- submit requisition
- approve requisition
- convert requisition to purchase order
- issue purchase order
- acknowledge purchase order
- create goods receipt
- receive goods
- accept goods
- create supplier invoice
- post supplier invoice
- create AP payment
- execute AP payment
- reconcile AP payment

Typical integration use cases:

- procurement platform creates and advances spend requests
- goods movement systems confirm receipts
- AP automation tools read invoice and payment status

### R2R capabilities

Foundation ERP supports the core R2R progression:

- create account
- create fiscal year
- create fiscal period
- create journal
- add journal line
- post journal
- close fiscal period
- lock fiscal period
- retrieve trial balance

Typical integration use cases:

- finance systems create journals from upstream transactions
- closing workflows enforce period controls
- reporting integrations retrieve trial balance and ledger state

### H2R capabilities

Foundation ERP supports the core H2R progression:

- create employee
- create position
- assign position
- issue credential
- create authority rule
- place employee on leave
- return employee from leave
- terminate employee

Typical integration use cases:

- H2R or identity systems publish canonical worker and role records
- governance services consume authority rules and role assignments
- orchestration layers read employee and credential state to drive approval routing

Implementation boundary:

- Foundation ERP exposes canonical H2R data and transitions
- cross-domain authority enforcement is intentionally handled by Constitutional ERP governance and mesh layers

## Hypermedia Behavior

Business entity responses include `_links` that describe valid next actions for the current state.

Example patterns:

- a Draft quote exposes a `send` action
- an Accepted quote exposes a `convert-to-order` action
- an Issued purchase order exposes an `acknowledge` action
- a Draft journal exposes a `post` action

For Integration Hub developers, this means orchestration can be made more resilient by following returned affordances rather than hard-coding every transition rule externally.

## Response Conventions

### Collection responses

List endpoints typically return:

```json
{
  "data": [
    {}
  ]
}
```

### Entity responses

Entity reads and creates return the resource body directly, usually with hypermedia links:

```json
{
  "quote_id": "Q-123",
  "state": "Draft",
  "_links": {
    "self": {
      "href": "/api/v1/o2c/quotes/Q-123",
      "method": "GET"
    }
  }
}
```

### Query API responses

Query endpoints return table metadata alongside the data:

```json
{
  "data": [],
  "table": "o2c_customer",
  "paging": {
    "limit": 100,
    "offset": 0,
    "count": 0
  }
}
```

### Error responses

Errors are returned in a problem-details style payload:

```json
{
  "type": "https://foundation-erp.local/problems/unauthorized",
  "title": "unauthorized",
  "status": 401,
  "detail": "Missing or invalid API key"
}
```

Typical error cases:

- `401 unauthorized` for missing or invalid API key
- `403 forbidden_ingress` for missing or invalid ingress identity
- `404 not_found` for unknown resources or unknown query tables
- `409 invalid_transition` for disallowed lifecycle actions
- `500 internal_error` for unexpected server faults

## Postman Usage

The repository includes a ready-to-run Postman collection and local environment.

Files:

- `postman/FoundationERP.postman_collection.json`
- `postman/FoundationERP.local.postman_environment.json`

### Import steps

1. Import the collection file into Postman.
2. Import the local environment file into Postman.
3. Select the imported `FoundationERP Local` environment.
4. Confirm these variables are correct for your target runtime:

   - `baseUrl`
   - `apiKey`
   - `ingressId`

### Default local values

- `baseUrl = http://localhost:3000`
- `apiKey = change-me`
- `ingressId = foundation-ingress`

### Collection folder overview

#### 00 - Health

Validates service availability.

#### 01 - Security

Validates expected authentication and ingress protection behavior.

#### 10 - O2C Flow

Runs a full quote-to-cash example end to end.

#### 20 - P2P Flow

Runs a full procure-to-pay example end to end.

#### 30 - R2R Flow

Runs a finance lifecycle example including journal posting and period lock.

#### 60 - H2R Flow

Runs an H2R lifecycle example including employee, position, assignment, credential, and authority rule transitions.

#### 40 - Events

Validates event feed retrieval.

#### 50 - Table Query API

Contains focused examples for:

- listing query tables
- reading a table
- reading a row by primary key
- negative test for an unknown table

#### 51 - Query All Tables

Contains:

- one summary validator request covering all query tables
- one request per whitelisted table

This is useful for regression validation and environment verification.

## Recommended Postman Workflow For Integration Hub Teams

### Initial connectivity test

Run these folders first:

1. `00 - Health`
2. `01 - Security`

This confirms:

- the service is reachable
- headers are configured correctly
- the API key and ingress id match the running environment

### Business capability validation

Run these next:

1. `10 - O2C Flow`
2. `20 - P2P Flow`
3. `30 - R2R Flow`
4. `60 - H2R Flow`

This validates that Integration Hub can create, transition, and read the main business objects.

### Observability validation

Run:

1. `40 - Events`
2. `50 - Table Query API`
3. `51 - Query All Tables`

This validates the supporting read surfaces used for reconciliation, diagnostics, and event-driven integration.

## Integration Patterns

### Pattern 1: Transactional orchestration

Use hypermedia endpoints to create and advance business documents.

Examples:

- create quote, then send and accept it
- create requisition, then approve and convert it
- create journal, add lines, and post it
- create employee, assign position, issue credential, and manage employee lifecycle

### Pattern 2: State polling

Use resource `GET` endpoints or table query endpoints to confirm state after a transaction.

Examples:

- `GET /api/v1/o2c/invoices/:invoiceId`
- `GET /api/v1/p2p/supplier-invoices/:supplierInvoiceId`
- `GET /api/v1/query/r2r_ledger_entry?limit=100&offset=0`

### Pattern 3: Event-driven consumption

Use the events feed as a lightweight polling mechanism for downstream integrations.

Example:

- poll `/api/v1/events?after=<lastTimestamp>`
- store the last successfully processed timestamp
- process newly emitted events incrementally

### Pattern 4: Semantic function invocation

Use the MCP function catalog if your integration platform works better with named operations than with resource/transition URLs.

Examples:

- `o2c_create_quote`
- `p2p_create_supplier_invoice`
- `r2r_post_journal`
- `h2r_assign_position`

## Practical Notes For Integration Hub Developers

- All authenticated requests must include both `x-api-key` and `x-ingress-id`.
- Health is unauthenticated and should be used as the first connectivity check.
- Business state transitions are enforced server-side. Invalid steps return `409 invalid_transition`.
- Query API access is whitelist-based. Unknown table names return `404 not_found`.
- The Postman collection already captures IDs between requests using environment variables.
- The R2R Postman flow uses a dynamic account code to avoid unique-key collisions on repeated runs.

## Recommended Adoption Approach

For a new Integration Hub consumer, the recommended sequence is:

1. import the Postman collection and environment
2. validate health and security folders
3. run one complete domain flow relevant to your integration (O2C, P2P, R2R, or H2R)
4. validate event and query surfaces
5. translate the validated requests into Integration Hub connectors, orchestrations, or mappings

## Postman Files In This Repository

- `postman/FoundationERP.postman_collection.json`
- `postman/FoundationERP.local.postman_environment.json`

## Summary

Foundation ERP provides a stable, testable API for canonical ERP workflows across O2C, P2P, R2R, and H2R.

For Integration Hub developers, the most important capabilities are:

- authenticated transactional APIs for business workflows
- hypermedia-driven lifecycle progression
- event polling for downstream automation
- direct table-query support for diagnostics and reconciliation
- a ready-made Postman collection for validation, onboarding, and regression testing

The included Postman assets are the fastest way to understand, validate, and operationalize the API before building production integration logic.
