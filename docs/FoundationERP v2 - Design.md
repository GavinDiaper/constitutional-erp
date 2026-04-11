Foundation ERP v2 – Developer Specification (v1)
________________________________________
1. Purpose and design goals
Goal: Foundation ERP v2 is the canonical ERP model and execution engine for the Constitutional stack. It must:
•	Provide a complete, stable, canonical model across core domains (P2P, O2C, R2R, H2R).
•	Represent a least common denominator of major ERPs (Oracle Fusion, SAP, Dynamics, etc.).
•	Emit canonical business events that can be replayed across any ERP.
•	Support canonical commands that map cleanly to vendor-specific APIs via Mesh.
•	Be rich enough to model real enterprise flows, but not so vendor-specific that it breaks portability.
Think of Foundation ERP v2 as the ERP-agnostic backbone that everything else (Integration Hub, PGE, Mesh, Navigator, Canvas) stands on.
________________________________________
2. Canonical domain model
We define four primary domains, each with canonical entities, states, and relationships.
2.1 P2P (Procure to Pay)
Entities:
•	Supplier
o	Key fields: supplierId, name, email, status, paymentTerms, taxId, currencyCode
o	States: Draft, Active, Suspended, Inactive
•	Requisition
o	Key fields: requisitionId, requesterId, department, lines[], totalAmount, currencyCode, neededByDate
o	States: Draft, Submitted, Approved, Rejected, ConvertedToPO, Cancelled
•	PurchaseOrder
o	Key fields: poId, supplierId, lines[], totalAmount, currencyCode, deliveryAddress
o	States: Draft, Approved, Sent, PartiallyReceived, FullyReceived, Closed, Cancelled
•	Invoice
o	Key fields: invoiceId, supplierId, poId?, amount, currencyCode, invoiceDate, dueDate
o	States: Draft, Validated, Posted, Paid, Cancelled
•	Payment
o	Key fields: paymentId, invoiceId, amount, currencyCode, paymentDate, method
o	States: Draft, Received, Applied, Reconciled, Cancelled
2.2 O2C (Order to Cash)
Entities:
•	Customer
o	customerId, name, email, billingAddress, shippingAddress, status
•	Quote
o	quoteId, customerId, lines[], totalAmount, currencyCode
o	States: Draft, Sent, Accepted, Rejected, ConvertedToOrder, Expired
•	SalesOrder
o	orderId, customerId, lines[], totalAmount, currencyCode
o	States: Draft, Confirmed, Allocated, Shipped, Invoiced, Closed, Cancelled
•	Shipment
o	shipmentId, orderId, shipDate, carrier, trackingNumber
o	States: Planned, Shipped, Delivered, Cancelled
•	ARInvoice
o	invoiceId, orderId, amount, currencyCode, invoiceDate, dueDate
o	States: Draft, Posted, Paid, Cancelled
•	ARPayment
o	paymentId, invoiceId, amount, currencyCode, paymentDate, method
o	States: Received, Applied, Reconciled, Cancelled
2.3 R2R (Record to Report)
Entities:
•	Journal
o	journalId, period, lines[], totalDebit, totalCredit
o	States: Draft, Validated, Posted, Reversed, Cancelled
•	Ledger
o	ledgerId, name, currencyCode, calendar, chartOfAccountsRef
•	Period
o	periodId, startDate, endDate
o	States: Open, Closing, Closed
2.4 H2R (Hire to Retire)
Entities:
•	Employee
o	employeeId, name, email, hireDate, status
o	States: Candidate, Active, OnLeave, Terminated
•	Assignment
o	assignmentId, employeeId, department, role, startDate, endDate?
o	States: Planned, Active, Completed, Cancelled
________________________________________
3. Canonical command model
Commands are the canonical actions that can be invoked via Mesh and exposed via MCP.
3.1 P2P commands (examples)
•	createSupplier
•	activateSupplier
•	suspendSupplier
•	createRequisition
•	submitRequisition
•	approveRequisition
•	rejectRequisition
•	cancelRequisition
•	createPurchaseOrder
•	approvePurchaseOrder
•	sendPurchaseOrder
•	receiveGoods (partial or full)
•	closePurchaseOrder
•	cancelPurchaseOrder
•	createInvoice
•	validateInvoice
•	postInvoice
•	cancelInvoice
•	registerPayment
•	applyPayment
•	reconcilePayment
•	cancelPayment
3.2 O2C commands (examples)
•	createCustomer
•	activateCustomer
•	createQuote
•	sendQuote
•	acceptQuote
•	rejectQuote
•	convertQuoteToOrder
•	createSalesOrder
•	confirmOrder
•	allocateOrder
•	shipOrder
•	generateInvoiceFromOrder
•	closeOrder
•	cancelOrder
•	postARInvoice
•	registerARPayment
•	applyARPayment
•	reconcileARPayment
3.3 R2R commands (examples)
•	createJournal
•	validateJournal
•	postJournal
•	reverseJournal
•	openPeriod
•	startPeriodClose
•	closePeriod
3.4 H2R commands (examples)
•	createEmployee
•	activateEmployee
•	terminateEmployee
•	createAssignment
•	activateAssignment
•	completeAssignment
•	cancelAssignment
Each command:
•	Has a canonical input schema (for MCP).
•	Produces canonical events (for CEP).
•	Maps to vendor-specific APIs via Mesh.
________________________________________
4. Canonical event model
Events are the replayable business facts that must be portable across ERPs.
4.1 Event envelope
All events share a common envelope:
{
  "eventId": "uuid",
  "eventType": "po.approved",
  "entityType": "PurchaseOrder",
  "entityId": "PO123",
  "timestamp": "2026-03-29T12:34:56Z",
  "actor": {
    "type": "user|system",
    "id": "user-123",
    "authorityTier": "T3"
  },
  "correlationId": "corr-abc",
  "causationId": "cmd-xyz",
  "payload": { /* domain-specific */ }
}
4.2 Example event types (P2P)
•	supplier.created
•	supplier.activated
•	requisition.created
•	requisition.submitted
•	requisition.approved
•	requisition.rejected
•	po.created
•	po.approved
•	po.sent
•	po.received.partial
•	po.received.full
•	po.closed
•	invoice.created
•	invoice.validated
•	invoice.posted
•	payment.registered
•	payment.applied
•	payment.reconciled
Similar patterns apply for O2C, R2R, H2R.
4.3 Replayability requirement
•	Events must be idempotent when replayed.
•	Applying the full event stream must reconstruct: 
o	ERP state
o	Ledger state
o	Process state (via PGE)
•	Events must be ERP-agnostic: 
o	No vendor-specific fields in the canonical payload.
o	Vendor-specific details live in Mesh adapters or ERP projections.
________________________________________
5. Process sophistication vs least common denominator
We want enterprise-grade flows that still replay on any ERP.
5.1 Design principles
•	No vendor-specific states (e.g. no “SAP-specific” status codes).
•	No vendor-specific commands (e.g. no “Fusion-only” operations).
•	States and transitions must exist in all major ERPs in some form.
•	Where vendors differ: 
o	Choose the intersection (least common denominator).
o	Represent vendor-specific richness as metadata, not core state.
5.2 Example: Purchase Order lifecycle
Canonical PO states:
•	Draft
•	Approved
•	Sent
•	PartiallyReceived
•	FullyReceived
•	Closed
•	Cancelled
All major ERPs support this lifecycle, even if they add extra internal states.
Commands:
•	createPurchaseOrder → po.created
•	approvePurchaseOrder → po.approved
•	sendPurchaseOrder → po.sent
•	receiveGoods → po.received.partial or po.received.full
•	closePurchaseOrder → po.closed
•	cancelPurchaseOrder → po.cancelled
Any ERP can:
•	Map its internal states to these canonical states.
•	Map its internal APIs to these canonical commands.
•	Emit or consume these canonical events.
________________________________________
6. Implementation guidance
6.1 Foundation ERP service
•	Implement as a single service with clear bounded contexts (P2P, O2C, R2R, H2R).
•	Expose internal APIs only (Mesh is the public consumer).
•	Persist canonical entities and events.
•	Enforce canonical validation rules.
6.2 Mesh integration
•	Mesh adapters call Foundation ERP commands.
•	Mesh emits canonical events to CEP.
•	Vendor ERPs are integrated via separate adapters that map: 
o	canonical commands → vendor APIs
o	vendor events → canonical events
6.3 Integration Hub & MCP
•	Integration Hub generates MCP functions from: 
o	Foundation ERP command metadata
o	Canonical schemas
•	Hypermedia transitions are derived from: 
o	PGE (process graphs)
o	Foundation ERP states
________________________________________
7. Developer checklist
•	For each entity:
o	Define canonical schema.
o	Define states.
o	Define transitions.
•	For each command:
o	Define input schema.
o	Implement in Foundation ERP.
o	Emit canonical events.
•	For each event:
o	Define payload schema.
o	Ensure idempotent replay.
•	For each domain flow (P2P, O2C, R2R, H2R):
o	Validate that the lifecycle: 
	Exists in Oracle, SAP, Dynamics.
	Can be mapped via Mesh adapters.
	Can be replayed from events alone.
