Foundation ERP – Developer Implementation Guide
Absolutely, Gavin — here is a single, unified, developer ready Foundation ERP design document that brings together Super O2C, Super P2P, and Super R2R into one coherent architectural and implementation guide.
This is written as if it were the official developer handbook for the Foundation ERP — the minimal, canonical, ERP agnostic, hypermedia driven, eventsourced ERP kernel that sits beneath the Constitutional ERP.
It’s structured, complete, and ready for your team to build from.
________________________________________
📘 Foundation ERP – Developer Implementation Guide
Canonical O2C, P2P, and R2R Domains
Node.js + TypeScript + better sqlite3
________________________________________
0. Purpose of the Foundation ERP
The Foundation ERP is a minimal, canonical, ERP agnostic ERP kernel designed to:
•	Provide stable, hypermedia driven process surfaces for AI navigation
•	Provide MCP function catalogs for safe AI execution
•	Provide canonical data models for O2C, P2P, and R2R
•	Provide event sourced projections for reconstructability
•	Provide ERP agnostic mapping surfaces for Oracle, SAP, Dynamics
•	Provide test harnesses for the Constitutional ERP Mesh, Ledger, Navigator, and Governance layers
It is not a full ERP.
It is a scaffold that:
•	Implements canonical processes
•	Implements canonical state machines
•	Implements canonical data models
•	Implements canonical hypermedia affordances
•	Implements canonical MCP functions
•	Emits canonical events
This allows the Constitutional ERP to:
•	Test AI navigation
•	Test governance injection
•	Test rollback/replay
•	Test ERP agnostic orchestration
•	Test multi domain interactions
________________________________________
1. Architecture Overview
Foundation ERP
 ├── O2C (Order to Cash)
 ├── P2P (Procure to Pay)
 ├── R2R (Record to Report)
 ├── Hypermedia API (HATEOAS)
 ├── MCP Function Catalog
 ├── Event Projection Layer
 └── better sqlite3 Persistence
The Foundation ERP exposes:
•	Hypermedia endpoints for each entity
•	MCP functions for each transition
•	Canonical SQL tables
•	Domain services implementing state machines
•	Repositories implementing persistence
•	Event emission for replay and testing
________________________________________
2. Project Structure
foundation-erp/
  src/
    app.ts
    server.ts

    db/
      connection.ts
      migrations/
        001_init.sql
        002_o2c.sql
        003_p2p.sql
        004_r2r.sql

    domain/
      o2c/
        customer/
        quote/
        order/
        fulfillment/
        invoice/
        payment/
      p2p/
        supplier/
        requisition/
        po/
        receipt/
        supplierInvoice/
        apPayment/
      r2r/
        coa/
        calendar/
        journal/
        ledger/
        trialBalance/

    api/
      hypermedia/
        o2c.routes.ts
        p2p.routes.ts
        r2r.routes.ts
      mcp/
        o2c.functions.ts
        p2p.functions.ts
        r2r.functions.ts

    utils/
      id.ts
      errors.ts
      hypermedia.ts

  foundation.db
  package.json
  tsconfig.json
  README.md
________________________________________
3. Shared Infrastructure
3.1 Database (better sqlite3)
export const db = new Database("foundation.db", {
  verbose: console.log
});

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
3.2 ID generator
export function newId(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}
3.3 Hypermedia utility
export const hypermedia = {
  entity(entity, links) {
    return { ...entity, _links: links };
  }
};
________________________________________
4. Super O2C Domain
4.1 Entities
•	Customer
•	Quote
•	SalesOrder
•	SalesOrderLine
•	Reservation
•	Fulfillment
•	Shipment
•	Invoice
•	Payment
•	Reconciliation
4.2 State Machines
Quote
•	Draft → Sent → Accepted → ConvertedToOrder
SalesOrder
•	Draft → Confirmed → Allocated → Shipped → Invoiced → Paid → Closed
Invoice
•	Draft → Posted → Paid → Reconciled
Payment
•	Received → Applied → Reconciled
4.3 Domain Services
Each service implements:
•	create()
•	addLine()
•	updateState()
•	require()
•	domain specific transitions
Example: QuoteService
send()
accept()
convertToOrder()
Example: SalesOrderService
confirm()
markAllocated()
markShipped()
markInvoiced()
markPaid()
4.4 Hypermedia
Example:
{
  "_links": {
    "add-line-item": {
      "href": "/o2c/quotes/Q123/lines",
      "method": "POST",
      "mcpFunction": "o2c_add_quote_line"
    },
    "convert-to-order": {
      "href": "/o2c/quotes/Q123/convert",
      "method": "POST",
      "mcpFunction": "o2c_convert_quote_to_order"
    }
  }
}
4.5 MCP Functions
•	o2c_create_quote
•	o2c_add_quote_line
•	o2c_send_quote
•	o2c_accept_quote
•	o2c_convert_quote_to_order
•	o2c_confirm_order
•	o2c_allocate_stock
•	o2c_ship_order
•	o2c_generate_invoice
•	o2c_post_invoice
•	o2c_register_payment
•	o2c_apply_payment_to_invoice
________________________________________
5. Super P2P Domain
5.1 Entities
•	Supplier
•	Requisition
•	RequisitionLine
•	PurchaseOrder
•	PurchaseOrderLine
•	GoodsReceipt
•	SupplierInvoice
•	ApPayment
5.2 State Machines
Requisition
•	Draft → Submitted → Approved → ConvertedToPO → Rejected
PurchaseOrder
•	Draft → Approved → Sent → PartiallyReceived → FullyReceived → Invoiced → Paid → Closed
GoodsReceipt
•	Draft → Posted
SupplierInvoice
•	Draft → Posted → Paid → Reconciled
ApPayment
•	Proposed → Approved → Executed → Reconciled
5.3 Domain Services
Example: RequisitionService
submit()
approve()
convertToPo()
Example: PurchaseOrderService
approve()
markSent()
markPartiallyReceived()
markFullyReceived()
markInvoiced()
markPaid()
5.4 Hypermedia
Example:
{
  "_links": {
    "submit": {
      "href": "/p2p/requisitions/REQ123/submit",
      "method": "POST",
      "mcpFunction": "p2p_submit_requisition"
    }
  }
}
5.5 MCP Functions
•	p2p_create_requisition
•	p2p_add_requisition_line
•	p2p_submit_requisition
•	p2p_approve_requisition
•	p2p_convert_requisition_to_po
•	p2p_add_po_line
•	p2p_approve_po
•	p2p_send_po
•	p2p_post_goods_receipt
•	p2p_create_supplier_invoice
•	p2p_post_supplier_invoice
•	p2p_propose_payment
•	p2p_approve_payment
•	p2p_execute_payment
________________________________________
6. Super R2R Domain
6.1 Entities
•	Account (Chart of Accounts)
•	FiscalYear
•	FiscalPeriod
•	Journal
•	JournalLine
•	LedgerEntry
•	TrialBalanceRow
6.2 State Machines
Journal
•	Draft → Posted → Reversed
FiscalPeriod
•	Open → Closed → Locked
6.3 Domain Services
CoaService
•	createAccount()
FiscalCalendarService
•	createYear()
•	createPeriods()
JournalService
•	createDraft()
•	addLine()
•	post()
LedgerService
•	postJournal()
TrialBalanceService
•	computeForPeriod()
6.4 Hypermedia
Example:
{
  "_links": {
    "post": {
      "href": "/r2r/journals/JNL123/post",
      "method": "POST",
      "mcpFunction": "r2r_post_journal"
    }
  }
}
6.5 MCP Functions
•	r2r_create_manual_journal
•	r2r_add_journal_line
•	r2r_post_journal
•	r2r_get_trial_balance
________________________________________
7. Event Layer
All domains emit events:
•	QuoteCreated
•	OrderConfirmed
•	GoodsReceived
•	SupplierInvoicePosted
•	JournalPosted
•	etc.
Events are stored in:
CREATE TABLE event (
  event_id TEXT PRIMARY KEY,
  entity_id TEXT,
  entity_type TEXT,
  event_type TEXT,
  version INTEGER,
  timestamp TEXT,
  payload TEXT
);
This supports:
•	Replay
•	Reconstructability
•	Mesh integration
•	AI simulation
________________________________________
8. Mapping Tables (ERP Agnostic)
For each domain, mapping tables exist for:
•	Oracle
•	SAP
•	Dynamics
Example (O2C SalesOrder):
Canonical	Oracle	SAP	Dynamics
orderId	OE_ORDER_HEADERS_ALL.ORDER_NUMBER	VBAK-VBELN	SalesTable.SalesId
Same structure exists for:
•	P2P (Requisition, PO, Invoice, Payment)
•	R2R (Accounts, Journals, Ledger)
________________________________________
9. Developer Workflow
1.	Clone repo
2.	Install dependencies
3.	Run migrations
4.	Start server
5.	Use hypermedia endpoints
6.	Use MCP functions
7.	Observe events
8.	Test replay
________________________________________
10. Summary
This unified Foundation ERP:
•	Implements canonical O2C, P2P, R2R
•	Provides hypermedia surfaces for AI navigation
•	Provides MCP functions for AI execution
•	Provides canonical data models for ERP agnostic integration
•	Provides event sourced projections for reconstructability
•	Provides state machines for governance testing
•	Provides developer friendly Node.js + TypeScript implementation
It is the perfect test harness and execution substrate for the Constitutional ERP.
