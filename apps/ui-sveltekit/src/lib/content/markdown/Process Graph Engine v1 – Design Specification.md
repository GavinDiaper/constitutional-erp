### Process Graph Engine v1 – Design Specification  

---

## 1. Purpose and role

The **Process Graph Engine (PGE)** is the canonical process layer of Constitutional ERP.

- Turns **canonical events** (from the Ledger) into **canonical state**  
- Defines **canonical transitions** for each domain  
- Exposes **canonical hypermedia** (“what is possible next”)  
- Applies **constitutional constraints** (via Charter Engine) on transitions  
- Serves **Navigator**, **Mesh Gateway**, and **Action Canvas**

PGE is **ERP‑agnostic** and **adapter‑agnostic**: it only sees canonical events and canonical aggregates.

---

## 2. Canonical state models (v1)

These are **logical states**, not ERP‑specific ones. They must be stable across ERPs.

#### 2.1 P2P – Procure to Pay

**Requisition**

- `Draft`  
- `Submitted`  
- `Approved`  
- `Rejected`  
- `ConvertedToPO`  
- `Cancelled`

**Purchase Order**

- `Draft`  
- `Issued`  
- `Acknowledged`  
- `PartiallyReceived`  
- `FullyReceived`  
- `Invoiced`  
- `PartiallyPaid`  
- `FullyPaid`  
- `Closed`  
- `Cancelled`

**Supplier Invoice**

- `Draft`  
- `Validated`  
- `Posted`  
- `PartiallyPaid`  
- `FullyPaid`  
- `Cancelled`

**AP Payment**

- `Initiated`  
- `Approved`  
- `Executed`  
- `Reconciled`  
- `Cancelled`

---

#### 2.2 O2C – Order to Cash

**Quote**

- `Draft`  
- `Sent`  
- `Accepted`  
- `Rejected`  
- `ConvertedToOrder`  
- `Cancelled`

**Sales Order**

- `Draft`  
- `Confirmed`  
- `Allocated`  
- `PartiallyShipped`  
- `FullyShipped`  
- `Invoiced`  
- `PartiallyPaid`  
- `FullyPaid`  
- `Closed`  
- `Cancelled`

**AR Invoice**

- `Draft`  
- `Posted`  
- `PartiallyPaid`  
- `FullyPaid`  
- `WrittenOff`  
- `Cancelled`

**AR Payment**

- `Received`  
- `Applied`  
- `Reconciled`  
- `Cancelled`

---

#### 2.3 R2R – Record to Report

**Journal Entry**

- `Draft`  
- `Posted`  
- `Reversed`  
- `Adjusted`  
- `Locked`  

**Period**

- `Open`  
- `PendingClose`  
- `Closed`  
- `Reopened`

---

#### 2.4 H2R – Hire to Retire

**Employee**

- `Candidate`  
- `Onboarding`  
- `Active`  
- `OnLeave`  
- `Terminated`  
- `Retired`

**Leave Request**

- `Draft`  
- `Submitted`  
- `Approved`  
- `Rejected`  
- `Taken`  
- `Cancelled`

---

## 3. Canonical transition definitions (v1)

Each transition is:

- **named** (verb)  
- **typed** (domain + aggregate)  
- **guarded** (by Charter Engine)  

Example structure:

```ts
interface CanonicalTransition {
  id: string; // e.g. "P2P.Requisition.Submit"
  domain: "P2P" | "O2C" | "R2R" | "H2R";
  aggregateType: string;
  fromStates: string[];
  toState: string;
  action: string; // "submit" | "approve" | "issue" | ...
}
```

#### 3.1 P2P examples

**Requisition**

- `submit`: Draft → Submitted  
- `approve`: Submitted → Approved  
- `reject`: Submitted → Rejected  
- `convertToPO`: Approved → ConvertedToPO  

**Purchase Order**

- `issue`: Draft → Issued  
- `acknowledge`: Issued → Acknowledged  
- `receive`: Issued/Acknowledged → PartiallyReceived/FullyReceived  
- `invoice`: FullyReceived → Invoiced  
- `close`: FullyPaid → Closed  

**Supplier Invoice**

- `validate`: Draft → Validated  
- `post`: Validated → Posted  
- `applyPayment`: Posted → PartiallyPaid/FullyPaid  

**AP Payment**

- `approvePayment`: Initiated → Approved  
- `executePayment`: Approved → Executed  
- `reconcilePayment`: Executed → Reconciled  

(Similar patterns for O2C, R2R, H2R.)

---

## 4. Canonical hypermedia contract

PGE exposes **canonical resources** with **canonical links**.

```json
{
  "id": "PO-123",
  "domain": "P2P",
  "type": "purchase-order",
  "state": "Issued",
  "attributes": {
    "supplierId": "SUP-001",
    "totalAmount": 1000,
    "currency": "USD"
  },
  "links": {
    "acknowledge": {
      "href": "/graph/p2p/purchase-orders/PO-123/acknowledge",
      "method": "POST",
      "rel": "transition",
      "requiresApproval": false
    },
    "cancel": {
      "href": "/graph/p2p/purchase-orders/PO-123/cancel",
      "method": "POST",
      "rel": "transition",
      "requiresApproval": true,
      "requiredTier": 3
    }
  }
}
```

**Rules:**

- `links` are derived from **canonical transitions** + **current state**.  
- Each link is then **filtered/annotated** by Charter Engine decisions.  
- PGE is the **source of truth** for “what is possible next”.

---

## 5. PGE API design (v1)

Base path: `/graph`

### 5.1 GET canonical resource

```http
GET /graph/{domain}/{aggregateType}/{id}
Headers:
  x-actor-id: EMP-123
  x-api-key: ...
```

**Behavior:**

1. Reconstruct state from Ledger (via CEP).  
2. Determine allowed transitions from canonical model.  
3. Call Charter Engine for each transition (authority + governance).  
4. Filter/annotate links.  
5. Return canonical resource.

---

### 5.2 POST transition

```http
POST /graph/{domain}/{aggregateType}/{id}/{action}
Headers:
  x-actor-id: EMP-123
  x-api-key: ...
Body:
  { ...optional payload... }
```

**Behavior:**

1. Reconstruct current state.  
2. Validate that `{action}` is a valid canonical transition from current state.  
3. Build governance context (amount, supplier, period, etc.).  
4. Call Authority Engine + Governance Engine.  
5. If **denied** → 403 + canonical error.  
6. If **requires approval** → create approval task (or delegate to Mesh Gateway, depending on integration mode).  
7. If **allowed** → emit canonical event(s) to Ledger (e.g. `P2P.PurchaseOrderIssued`).  
8. Optionally call Mesh Gateway to execute ERP action (see integration section).  
9. Return updated canonical resource.

---

## 6. PGE replay model

PGE does **not** store its own state; it reconstructs from the Ledger.

### 6.1 Per‑aggregate replay

```ts
interface AggregateState {
  id: string;
  domain: string;
  type: string;
  state: string;
  attributes: Record<string, any>;
}

function rebuildAggregate(domain: string, type: string, id: string): AggregateState {
  const events = ledger.getEvents(domain, type, id);
  let state = initialState(domain, type);

  for (const event of events) {
    state = applyEvent(state, event);
  }

  return state;
}
```

- `applyEvent` is domain‑specific.  
- PGE uses this for every GET/POST.

### 6.2 Performance

- v1: direct replay per aggregate (volumes small).  
- v2+: optional snapshots per aggregate to speed up reconstruction.

---

## 7. PGE integration with Mesh Gateway

There are two phases: **v1 reality** and **future alignment**.

### 7.1 v1 reality (today)

- Mesh Gateway proxies **ERP hypermedia** and enforces constitutional checks.  
- PGE is **introduced alongside**, not yet on the hot path.  

Integration pattern:

- Mesh Gateway continues to call Foundation ERP.  
- PGE consumes canonical events from CEP and builds canonical state.  
- Navigator and Action Canvas use PGE for **read/plan**, Mesh Gateway for **execute**.

So:

- **Reads** (for AI/UX): via PGE `/graph/...`  
- **Writes** (actual execution): via Mesh `/mesh/...`

### 7.2 Future alignment (target)

Target architecture:

- Mesh Gateway becomes a **thin constitutional proxy**.  
- PGE becomes the **canonical process brain**.  

Flow:

1. Client / Navigator calls PGE to get canonical hypermedia.  
2. Client / Navigator chooses a transition and calls PGE POST.  
3. PGE:
   - validates transition  
   - calls Charter Engine  
   - emits canonical event(s)  
   - calls Mesh Gateway to execute ERP action (if needed)  
4. Mesh Gateway:
   - routes to adapter  
   - executes ERP action  
   - emits Mesh events  
5. CEP:
   - ingests both PGE and Mesh events into Ledger.  

In that model:

- PGE owns **canonical process**.  
- Mesh Gateway owns **ERP execution + constitutional enforcement at the edge**.  
- Ledger + CEP own **history**.  
- Navigator + Canvas sit on top of PGE.