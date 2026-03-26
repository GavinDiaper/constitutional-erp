# Foundation ERP Endpoint Reference

## Purpose

This document is a compact companion to the broader Integration Hub API guide.

It is intended for implementers who need:

- the base URL and headers
- the main endpoints by domain
- example request payloads
- example response shapes
- a quick map of what to call first

For broader usage guidance, process context, and Postman workflow, see `docs/IntegrationHub-API-Guide.md`.

## Base URL And Headers

### Local default base URL

- `http://localhost:3000`

### Required headers for `/api/v1/*`

```http
x-api-key: change-me
x-ingress-id: foundation-ingress
Content-Type: application/json
```

### Unauthenticated endpoint

- `GET /health`

## Common Response Patterns

### List response

```json
{
  "data": []
}
```

### Entity response

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

### Error response

```json
{
  "type": "https://foundation-erp.local/problems/invalid_transition",
  "title": "invalid_transition",
  "status": 409,
  "detail": "Cannot transition quote from Draft to Accepted"
}
```

## Health

### GET /health

Purpose:

- confirm service availability

Example response:

```json
{
  "status": "ok",
  "service": "foundation-erp"
}
```

## O2C Endpoint Reference

### Customers

#### GET /api/v1/o2c/customers

Purpose:

- list customers

#### GET /api/v1/o2c/customers/:customerId

Purpose:

- get a customer by id

#### POST /api/v1/o2c/customers

Purpose:

- create customer

Example request:

```json
{
  "customerName": "Contoso Retail",
  "email": "billing@contoso.example"
}
```

Example response:

```json
{
  "customer_id": "CUST-123",
  "customer_name": "Contoso Retail",
  "email": "billing@contoso.example",
  "status": "Active"
}
```

### Quotes

#### GET /api/v1/o2c/quotes

- list quotes

#### GET /api/v1/o2c/quotes/:quoteId

- get quote by id

#### POST /api/v1/o2c/quotes

- create quote

Example request:

```json
{
  "customerId": "CUST-123",
  "currencyCode": "USD"
}
```

#### POST /api/v1/o2c/quotes/:quoteId/lines

- add quote line

Example request:

```json
{
  "sku": "SKU-100",
  "quantity": 2,
  "unitPrice": 5
}
```

#### POST /api/v1/o2c/quotes/:quoteId/send

- transition Draft to Sent

#### POST /api/v1/o2c/quotes/:quoteId/accept

- transition Sent to Accepted

#### POST /api/v1/o2c/quotes/:quoteId/convert

- convert accepted quote to sales order

### Orders

#### GET /api/v1/o2c/orders

- list orders

#### GET /api/v1/o2c/orders/:orderId

- get order by id

#### POST /api/v1/o2c/orders/:orderId/confirm

- transition Draft to Confirmed

#### POST /api/v1/o2c/orders/:orderId/allocate

- transition Confirmed to Allocated

#### POST /api/v1/o2c/orders/:orderId/ship

- transition Allocated to Shipped

#### POST /api/v1/o2c/orders/:orderId/generate-invoice

- create invoice from shipped order

### Invoices

#### GET /api/v1/o2c/invoices

- list invoices

#### GET /api/v1/o2c/invoices/:invoiceId

- get invoice by id

#### POST /api/v1/o2c/invoices/:invoiceId/post

- transition invoice Draft to Posted

### Payments

#### GET /api/v1/o2c/payments

- list payments

#### GET /api/v1/o2c/payments/:paymentId

- get payment by id

#### POST /api/v1/o2c/payments

- register payment

Example request:

```json
{
  "invoiceId": "INV-123",
  "amount": 10
}
```

#### POST /api/v1/o2c/payments/:paymentId/apply

- transition payment Received to Applied

#### POST /api/v1/o2c/payments/:paymentId/reconcile

- transition payment Applied to Reconciled

## P2P Endpoint Reference

### Suppliers

#### GET /api/v1/p2p/suppliers

- list suppliers

#### GET /api/v1/p2p/suppliers/:supplierId

- get supplier by id

#### POST /api/v1/p2p/suppliers

- create supplier

Example request:

```json
{
  "supplierName": "Northwind Supply",
  "email": "ap@northwind.example"
}
```

### Requisitions

#### GET /api/v1/p2p/requisitions

- list requisitions

#### GET /api/v1/p2p/requisitions/:requisitionId

- get requisition by id

#### POST /api/v1/p2p/requisitions

- create requisition

Example request:

```json
{
  "requester": "integration.user"
}
```

#### POST /api/v1/p2p/requisitions/:requisitionId/submit

- transition Draft to Submitted

#### POST /api/v1/p2p/requisitions/:requisitionId/approve

- transition Submitted to Approved

#### POST /api/v1/p2p/requisitions/:requisitionId/convert

- convert approved requisition to purchase order

Example request:

```json
{
  "supplierId": "SUP-123"
}
```

### Purchase Orders

#### GET /api/v1/p2p/purchase-orders

- list purchase orders

#### GET /api/v1/p2p/purchase-orders/:poId

- get purchase order by id

#### POST /api/v1/p2p/purchase-orders

- create purchase order directly

#### POST /api/v1/p2p/purchase-orders/:poId/issue

- transition Draft to Issued

#### POST /api/v1/p2p/purchase-orders/:poId/acknowledge

- transition Issued to Acknowledged

### Goods Receipts

#### GET /api/v1/p2p/goods-receipts

- list goods receipts

#### GET /api/v1/p2p/goods-receipts/:receiptId

- get goods receipt by id

#### POST /api/v1/p2p/goods-receipts

- create goods receipt

Example request:

```json
{
  "poId": "PO-123"
}
```

#### POST /api/v1/p2p/goods-receipts/:receiptId/receive

- transition Draft to Received

#### POST /api/v1/p2p/goods-receipts/:receiptId/accept

- transition Received to Accepted

### Supplier Invoices

#### GET /api/v1/p2p/supplier-invoices

- list supplier invoices

#### GET /api/v1/p2p/supplier-invoices/:supplierInvoiceId

- get supplier invoice by id

#### POST /api/v1/p2p/supplier-invoices

- create supplier invoice from goods receipt

Example request:

```json
{
  "receiptId": "GR-123"
}
```

#### POST /api/v1/p2p/supplier-invoices/:supplierInvoiceId/post

- transition Draft to Posted

### AP Payments

#### GET /api/v1/p2p/ap-payments

- list AP payments

#### GET /api/v1/p2p/ap-payments/:apPaymentId

- get AP payment by id

#### POST /api/v1/p2p/ap-payments

- create AP payment

Example request:

```json
{
  "supplierInvoiceId": "APINV-123",
  "amount": 0.01
}
```

#### POST /api/v1/p2p/ap-payments/:apPaymentId/execute

- transition Initiated to Executed

#### POST /api/v1/p2p/ap-payments/:apPaymentId/reconcile

- transition Executed to Reconciled

## R2R Endpoint Reference

### Accounts

#### GET /api/v1/r2r/accounts

- list accounts

#### GET /api/v1/r2r/accounts/:accountId

- get account by id

#### POST /api/v1/r2r/accounts

- create account

Example request:

```json
{
  "accountCode": "1100-1001",
  "accountName": "Cash",
  "accountType": "Asset"
}
```

### Fiscal Years

#### GET /api/v1/r2r/fiscal-years

- list fiscal years

#### GET /api/v1/r2r/fiscal-years/:fiscalYearId

- get fiscal year by id

#### POST /api/v1/r2r/fiscal-years

- create fiscal year

Example request:

```json
{
  "yearLabel": "FY2027",
  "startDate": "2027-01-01",
  "endDate": "2027-12-31"
}
```

#### POST /api/v1/r2r/fiscal-years/:fiscalYearId/close

- transition Open to Closed

### Fiscal Periods

#### GET /api/v1/r2r/fiscal-periods

- list fiscal periods
- optional query parameter: `fiscalYearId`

#### GET /api/v1/r2r/fiscal-periods/:fiscalPeriodId

- get fiscal period by id

#### POST /api/v1/r2r/fiscal-periods

- create fiscal period

Example request:

```json
{
  "fiscalYearId": "FY-123",
  "periodNumber": 1,
  "startDate": "2027-01-01",
  "endDate": "2027-01-31"
}
```

#### POST /api/v1/r2r/fiscal-periods/:fiscalPeriodId/close

- transition Open to Closed

#### POST /api/v1/r2r/fiscal-periods/:fiscalPeriodId/lock

- transition Closed to Locked

### Journals

#### GET /api/v1/r2r/journals

- list journals

#### GET /api/v1/r2r/journals/:journalId

- get journal by id

#### POST /api/v1/r2r/journals

- create journal

Example request:

```json
{
  "fiscalPeriodId": "FP-123",
  "description": "Opening balance"
}
```

#### POST /api/v1/r2r/journals/:journalId/lines

- add journal line

Example request:

```json
{
  "accountId": "ACC-123",
  "debitAmount": 10,
  "creditAmount": 0,
  "memo": "opening"
}
```

#### POST /api/v1/r2r/journals/:journalId/post

- transition Draft to Posted

### Trial Balance

#### GET /api/v1/r2r/trial-balance/:fiscalPeriodId

- return summarized balances for the fiscal period

## H2R Endpoint Reference

### Employees

#### GET /api/v1/h2r/employees

- list employees

#### GET /api/v1/h2r/employees/:employeeId

- get employee by id

#### POST /api/v1/h2r/employees

- hire employee in Active status

Example request:

```json
{
  "name": "Alice Governance",
  "email": "alice.governance@example.com"
}
```

#### POST /api/v1/h2r/employees/:employeeId/leave

- transition Active to OnLeave

#### POST /api/v1/h2r/employees/:employeeId/return

- transition OnLeave to Active

#### POST /api/v1/h2r/employees/:employeeId/terminate

- transition Active or OnLeave to Terminated

### Positions

#### GET /api/v1/h2r/positions

- list positions

#### GET /api/v1/h2r/positions/:positionId

- get position by id

#### POST /api/v1/h2r/positions

- create position and authority tier

Example request:

```json
{
  "title": "Finance Controller",
  "department": "Finance",
  "authorityDomain": "R2R",
  "authorityTier": 3
}
```

### Assignments

#### GET /api/v1/h2r/assignments

- list assignments
- optional query parameter: `employeeId`

#### GET /api/v1/h2r/assignments/:assignmentId

- get assignment by id

#### POST /api/v1/h2r/assignments

- create active assignment

Example request:

```json
{
  "employeeId": "EMP-123",
  "positionId": "POS-123"
}
```

#### POST /api/v1/h2r/assignments/:assignmentId/end

- transition Active to Ended

### Credentials

#### GET /api/v1/h2r/credentials

- list credentials
- optional query parameter: `employeeId`

#### GET /api/v1/h2r/credentials/:credentialId

- get credential by id

#### POST /api/v1/h2r/credentials

- issue credential in Valid status

Example request:

```json
{
  "employeeId": "EMP-123",
  "type": "FinancialApproval",
  "expiryDate": "2027-12-31"
}
```

#### POST /api/v1/h2r/credentials/:credentialId/expire

- transition Valid to Expired

#### POST /api/v1/h2r/credentials/:credentialId/revoke

- transition Valid to Revoked

### Authority Rules

#### GET /api/v1/h2r/authority-rules

- list authority rules
- optional query parameter: `domain`

#### GET /api/v1/h2r/authority-rules/:ruleId

- get authority rule by id

#### POST /api/v1/h2r/authority-rules

- create authority threshold rule

Example request:

```json
{
  "domain": "R2R",
  "threshold": 10000,
  "requiredTier": 3
}
```

## Events Endpoint Reference

### GET /api/v1/events

Purpose:

- poll emitted events

Query parameters:

- `limit`
- `after`

Example:

```http
GET /api/v1/events?limit=100&after=2026-03-26T00:00:00.000Z
```

## Query API Endpoint Reference

### GET /api/v1/query/tables

- list all whitelisted tables and their primary keys

### GET /api/v1/query/:table

- list rows from a whitelisted table

Supported query parameters:

- `limit`
- `offset`

Example:

```http
GET /api/v1/query/o2c_customer?limit=100&offset=0
```

### GET /api/v1/query/:table/:id

- get one row by the configured primary key

Example:

```http
GET /api/v1/query/o2c_customer/CUST-123
```

## MCP Endpoint Reference

### GET /api/v1/mcp/functions

- list supported semantic function names

### POST /api/v1/mcp/invoke

- invoke a named semantic function

Example request:

```json
{
  "functionName": "o2c_create_quote",
  "input": {
    "customerId": "CUST-123",
    "currencyCode": "USD"
  }
}
```

## Recommended Call Order For New Consumers

1. `GET /health`
2. `GET /api/v1/o2c/customers` with auth headers
3. run the relevant Postman domain flow
4. validate `/api/v1/events`
5. validate `/api/v1/query/tables`

## Postman Files

- `postman/FoundationERP.postman_collection.json`
- `postman/FoundationERP.local.postman_environment.json`
