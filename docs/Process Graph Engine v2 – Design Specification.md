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
Here’s the principled, constitutional answer — and it flows directly from the six characteristics you listed.  
This is one of those decisions where the *architecture tells you the truth* if you listen carefully.

---

# ⭐ **Short Answer**  
**Default behaviour for `create` and `initiate` should be:  
→ *No approval required unless the constitution or risk‑tier rules explicitly demand it.*  
→ *Approval is triggered by value‑at‑risk, authority tier, or constitutional constraints — not by the mere act of creation.*  

This is the only approach fully aligned with the Key Characteristics of Constitutional ERP.

Let me walk you through why.

---

# 🧱 1. AI‑Driven Execution → Navigator must be able to act without unnecessary human gates  
If every `create` or `initiate` required approval by default, Navigator becomes:

- blocked  
- throttled  
- unable to execute autonomously  
- unable to propose meaningful next steps  
- unable to simulate realistic flows  

AI‑driven execution requires:

- **freedom to act**  
- **freedom to propose**  
- **freedom to initiate processes**  

Approvals should be **risk‑based**, not **action‑based**.

---

# 🧭 2. Human‑Anchored Governance → Approvals must be tied to *risk*, not *verbs*  
Your principle says:

> *Users act as approvers and governors, with authority determined by earned credentials and risk tiers.*

This means:

- A low‑risk create/initiate should not require approval.  
- A high‑risk create/initiate *should* require approval.  
- Approval is a **function of risk**, not a **function of workflow stage**.

If you force approvals on all creates/initiates, you violate the principle of **earned authority**.

---

# 🧩 3. Constitutional Control Layer → Only the constitution decides when approval is required  
The constitution defines:

- separation of duties  
- risk thresholds  
- authority tiers  
- mandatory approvals  
- forbidden actions  

The constitution does **not** say:

> “All creates must be approved.”

It says:

> “Actions must comply with immutable rules and domain constraints.”

So the correct behaviour is:

- **If the constitution says approval is required → require it.**  
- **If the risk tier says approval is required → require it.**  
- **Otherwise → no approval.**

This is clean, principled, and future‑proof.

---

# 🧠 4. Event‑Sourced Temporal Integrity → Creation is not a risk event  
Event sourcing teaches us:

- Creation is a *fact*, not a *commitment*.  
- Risk emerges when value is committed, not when a record is created.  
- Approval should be tied to *commitment*, not *initialisation*.

Examples:

- Creating a PO is low‑risk.  
- Issuing a PO is high‑risk.  
- Creating a supplier is low‑risk.  
- Approving a supplier is high‑risk.  
- Creating a journal entry is low‑risk.  
- Posting a journal entry is high‑risk.

This is how event‑sourced systems naturally behave.

---

# 🌐 5. Mesh‑Native Architecture → Approvals must be consistent across ERPs  
If you hard‑code approvals into the process graph:

- You force every ERP to behave the same way  
- You override ERP‑native approval logic  
- You break interoperability  
- You create unnecessary friction  

Instead:

- The constitution defines approval rules  
- Navigator enforces them  
- Mesh executes them  
- PGE reflects them  

This keeps the architecture clean.

---

# 🧭 6. Process‑First UX → Users see actions, not approvals  
In a process‑first UX:

- The user sees **state‑driven affordances**  
- Navigator proposes **next actions**  
- Approval is just another **transition**  
- Approval is not a separate UI module  

If you force approvals on create/initiate:

- You clutter the UX  
- You break the process‑first model  
- You introduce unnecessary friction  

Navigator should only surface approvals when they are **constitutionally required**.

---

# ⭐ **Final Recommendation (Architecturally Correct)**

### ✔ Default:  
**`create` and `initiate` require *no approval* unless:**

- the constitution mandates it  
- the risk tier mandates it  
- the authority model mandates it  
- the domain model mandates it  

### ✔ Approval should be triggered by:  
- **value at risk**  
- **financial exposure**  
- **supplier risk**  
- **counterparty risk**  
- **SoD violations**  
- **authority tier mismatch**  
- **constitutional constraints**

### ✔ Approval should *not* be triggered by:  
- the fact that the action is “create”  
- the fact that the action is “initiate”  
- workflow stage semantics  
- legacy ERP habits  

### ✔ Navigator + Charter Engine decide approval dynamically  
The process graph should not hard‑code approvals.  
The constitution should decide.  
Navigator should enforce.

---

# 🎯 Crisp one‑liner you can give the team  
> **In Constitutional ERP, create/initiate actions do not require approval by default.  
> Approval is triggered only by constitutional rules or value‑at‑risk, not by workflow stage.**

Gavin, this is a *perfect* moment to clarify the constitutional philosophy behind **authority**, **roles**, and **approvals** — because this is where most ERP platforms get trapped in legacy thinking. You’re asking the right question:  

> **Are we doing roles like “procurement‑manager”, or tiers of approval, or both?  
> What was the original intent of the constitutional approach?**

Let’s anchor this in first principles.

---

# ⭐ The Constitutional Model:  
## **We do NOT do roles.  
We do NOT do role-based approvals.  
We do authority tiers based on earned credentials.**

This is the heart of the constitutional approach.

Let me break it down clearly.

---

# 🧱 1. Why we do NOT use roles like “procurement‑manager”
Traditional ERPs use:

- roles  
- job titles  
- static permission sets  
- module-based access  

This leads to:

- brittle security  
- political fights over permissions  
- inconsistent governance  
- impossible-to-audit access  
- role explosion (“procurement-manager-level-2-with-exception”)  

The constitutional architecture *explicitly rejects* this model.

Roles are **organizational constructs**, not **constitutional constructs**.

Roles change.  
Authority does not.

---

# ⭐ 2. The Constitutional Approach: Earned Authority Tiers  
The **Authority Engine** was designed to replace roles with:

### ✔ Earned credentials  
### ✔ Authority tiers  
### ✔ Behavioural scoring  
### ✔ Domain-specific trust  
### ✔ Revocation and decay  

This is a **meritocratic, risk-based authority system**, not a role-based one.

Examples:

- A user earns **Tier 1** authority for P2P after completing training + good behaviour.  
- A user earns **Tier 2** authority after successfully executing high-value actions.  
- A user loses authority if they make repeated mistakes.  
- Authority decays over time if not used.  

This is **dynamic**, **adaptive**, and **constitutional**.

---

# 🧭 3. So what about “procurement-manager”?  
In the constitutional model:

- “Procurement-manager” is *not* a permission set.  
- It is *not* an authority level.  
- It is *not* a governance concept.  

It is simply an **organizational label** that may or may not correlate with authority.

Authority is earned, not assigned.

A junior analyst could have Tier 3 authority if they’ve earned it.  
A senior manager could have Tier 1 authority if they haven’t.

This is the whole point.

---

# ⭐ 4. Approvals: Based on **risk tiers**, not **roles**
Approvals should be triggered by:

### ✔ value-at-risk  
### ✔ financial exposure  
### ✔ supplier risk  
### ✔ counterparty risk  
### ✔ SoD constraints  
### ✔ constitutional rules  
### ✔ authority tier mismatch  

Approvals should **not** be triggered by:

- job titles  
- roles  
- workflow stage semantics  
- organizational hierarchy  

This is the cleanest, most principled model.

---

# 🧩 5. How the three constitutional subsystems work together

## **Authority Engine (Earned Authority System)**  
Determines *who* has the right to act, based on:

- earned credentials  
- behavioural scoring  
- domain trust  
- authority tiers  
- revocation and decay  

## **Process Graph Engine (PGE)**  
Determines *what* is possible next:

- states  
- transitions  
- hypermedia affordances  
- domain semantics  

## **Charter Engine (Governance)**  
Determines *whether* an action is allowed:

- constitutional constraints  
- SoD rules  
- risk thresholds  
- approval requirements  
- authority validation  

Navigator sits on top of all three.

---

# ⭐ 6. So what is the correct answer to your question?

## ✔ We do **authority tiers**, not roles.  
## ✔ We do **risk-based approvals**, not role-based approvals.  
## ✔ We do **constitutional constraints**, not workflow-based approvals.  
## ✔ We do **earned authority**, not assigned authority.  
## ✔ We do **dynamic governance**, not static permission sets.

This is the original intent of the constitutional architecture.

---

# 🎯 Final, crisp guidance for the team  
> **We do not use roles like “procurement-manager” to determine authority or approvals.  
> We use earned authority tiers, validated by the Authority Engine, and enforced by the Charter Engine.  
> Approvals are triggered by risk, not by job titles.**

This keeps the system:

- fair  
- auditable  
- adaptive  
- constitutional  
- future-proof  




