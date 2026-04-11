# **📦 Canonical → ERP Mapping (Purchase Order)**  
### *Mesh Adapter Mapping Sketch (Canonical | SAP | Oracle Fusion | Dynamics 365)*

Below is the mapping table, followed by deeper notes for each ERP.

---

# **1. Canonical PO Fields → ERP Fields**

| **Canonical Field** | **SAP (MM / S4HANA)** | **Oracle Fusion (Procurement)** | **Dynamics 365 F&O** |
|---------------------|------------------------|----------------------------------|------------------------|
| `poId` | `EKKO-EBELN` | `poHeaderId` | `PurchId` |
| `supplierId` | `LIFNR` | `supplierId` | `VendorAccount` |
| `currencyCode` | `WAERS` | `currencyCode` | `CurrencyCode` |
| `totalAmount` | Calculated from EKPO | `totalAmount` | `LineAmount` sum |
| `deliveryAddress` | `ADRNR` | `shipToLocationId` | `DeliveryAddress` |
| `lines[].sku` | `MATNR` | `itemId` | `ItemId` |
| `lines[].quantity` | `MENGE` | `quantity` | `PurchQty` |
| `lines[].unitPrice` | `NETPR` | `unitPrice` | `PurchPrice` |
| `status` | `BSTYP/BSTAE` | `statusCode` | `DocumentStatus` |

---

# **2. Canonical PO States → ERP States**

| **Canonical State** | **SAP** | **Oracle Fusion** | **Dynamics 365** |
|---------------------|---------|--------------------|-------------------|
| `Draft` | Created (not released) | Incomplete | Draft |
| `Approved` | Released (`FRGZU`) | Approved | Approved |
| `Sent` | Output message triggered | Communicated | Confirmed |
| `PartiallyReceived` | GR posted < ordered qty | Partially Received | Partially Received |
| `FullyReceived` | GR posted = ordered qty | Fully Received | Received |
| `Closed` | Final Invoice / Delivery | Closed | Closed |
| `Cancelled` | Flagged for deletion | Cancelled | Cancelled |

---

# **3. Canonical Commands → ERP API Calls**

| **Canonical Command** | **SAP** | **Oracle Fusion** | **Dynamics 365** |
|------------------------|---------|--------------------|-------------------|
| `createPurchaseOrder` | BAPI_PO_CREATE1 | `createPurchaseOrder` REST API | `PurchaseOrderHeaders` POST |
| `approvePurchaseOrder` | Release Strategy (`ME29N`) | `approvePurchaseOrder` | Workflow approval API |
| `sendPurchaseOrder` | Output Management (`NACE`) | `sendPurchaseOrder` | Confirm PO |
| `receiveGoods` | `MIGO` / `BAPI_GOODSMVT_CREATE` | `receiveGoods` | `InventReceipt` |
| `closePurchaseOrder` | Final Delivery flag | `closePurchaseOrder` | Close PO |
| `cancelPurchaseOrder` | Deletion flag | `cancelPurchaseOrder` | Cancel PO |

---

# **4. Canonical Events → ERP Events**

| **Canonical Event** | **SAP Equivalent** | **Oracle Fusion Equivalent** | **Dynamics 365 Equivalent** |
|----------------------|--------------------|-------------------------------|------------------------------|
| `po.created` | PO Created (EKKO) | PO Created | Purchase order created |
| `po.approved` | Release Strategy Completed | Approved | Approved |
| `po.sent` | Output Message Sent | Communicated | Confirmed |
| `po.received.partial` | Partial GR | Partial Receipt | Partial Receipt |
| `po.received.full` | Full GR | Fully Received | Received |
| `po.closed` | Final Delivery + Final Invoice | Closed | Closed |
| `po.cancelled` | Deletion Flag | Cancelled | Cancelled |

---

# **5. Mapping Notes (Deep Dive)**

## **SAP (S/4HANA, MM)**

SAP is the most structured and rigid of the three. Key points:

- PO approval is handled via **Release Strategy**, not a simple “approve” API.
- “Sent” is triggered by **Output Management**, not a direct API call.
- Goods receipt is done via **Material Document** creation.
- Closing a PO is done via **Final Delivery** and **Final Invoice** flags.

**Mesh adapter strategy:**

- Wrap BAPIs (`BAPI_PO_CREATE1`, `BAPI_PO_CHANGE`, `BAPI_GOODSMVT_CREATE`).
- Use IDocs or OData for modern integrations.
- Normalize SAP’s multi-document model into canonical events.

---

## **Oracle Fusion Procurement**

Fusion is the most API-friendly and aligns well with canonical semantics.

Key points:

- PO approval is a direct API call.
- PO communication (“send”) is also a direct API call.
- Receipts and invoices are first-class REST resources.
- Fusion has a clean event model (Business Events).

**Mesh adapter strategy:**

- Use REST APIs for all canonical commands.
- Map Fusion’s status codes to canonical states.
- Use Fusion Business Events to emit canonical events.

---

## **Dynamics 365 Finance & Operations**

Dynamics is flexible but inconsistent across modules.

Key points:

- PO confirmation is the equivalent of “sent”.
- Approval is workflow-driven.
- Receipts are inventory transactions.
- Closing is explicit.

**Mesh adapter strategy:**

- Use Data Entities (`PurchaseOrderHeaders`, `PurchaseOrderLines`).
- Use Workflow APIs for approval.
- Use Inventory Receipt APIs for goods receipt.
- Normalize Dynamics’ flexible statuses into canonical states.

---

# **6. Mapping Strategy (General Rules)**

### **Rule 1 — Canonical commands must be atomic**
Even if SAP or Dynamics require multiple steps, Mesh must wrap them into a single canonical command.

### **Rule 2 — Canonical states must be stable**
ERP-specific states must be mapped into canonical states, not the other way around.

### **Rule 3 — Canonical events must be ERP-agnostic**
ERP-specific metadata must not leak into canonical events.

### **Rule 4 — Mesh adapters must be idempotent**
Replays must not create duplicate POs or receipts.

### **Rule 5 — Canonical model must be the least common denominator**
If SAP has 20 states and Fusion has 8, canonical should have 6–8.

---

# **7. Example: Full PO Lifecycle Mapping**

Here’s a complete example of how a canonical PO lifecycle maps across ERPs:

```text
Canonical: Draft
SAP: Created (not released)
Fusion: Incomplete
Dynamics: Draft

Canonical: Approved
SAP: Release Strategy Complete
Fusion: Approved
Dynamics: Approved

Canonical: Sent
SAP: Output Message Sent
Fusion: Communicated
Dynamics: Confirmed

Canonical: PartiallyReceived
SAP: Partial GR
Fusion: Partial Receipt
Dynamics: Partial Receipt

Canonical: FullyReceived
SAP: Full GR
Fusion: Fully Received
Dynamics: Received

Canonical: Closed
SAP: Final Delivery + Final Invoice
Fusion: Closed
Dynamics: Closed

Canonical: Cancelled
SAP: Deletion Flag
Fusion: Cancelled
Dynamics: Cancelled
```

---

# **8. Developer Guidance**

### **Mesh adapter structure**

```
mesh/
  adapters/
    sap/
      purchaseOrderAdapter.ts
    oracleFusion/
      purchaseOrderAdapter.ts
    dynamics/
      purchaseOrderAdapter.ts
  canonical/
    purchaseOrder.ts
    events.ts
    commands.ts
```

### **Adapter responsibilities**

- Translate canonical → ERP API calls.
- Translate ERP events → canonical events.
- Guarantee idempotency.
- Guarantee canonical state mapping.

