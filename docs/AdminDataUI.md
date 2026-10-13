# 🌐 **The Correct Data Strategy for Canvas + Admin**

There are **two different kinds of data** the UI needs:

## **1. Canonical *process* data**  
- Hypermedia  
- Governance metadata  
- Allowed transitions  
- Navigator proposals  
- Simulations  
- Navlog  
- Transcript  
- Event streams  

This **must** come from **Integration Hub v2**.

Because:

- Hub is the **constitutional boundary**  
- Hub knows governance  
- Hub knows actor context  
- Hub knows allowed transitions  
- Hub knows MCP metadata  
- Hub knows process state  
- Hub knows Navigator sessions  

**FoundationERP does not know any of this.**

So for anything related to:

- Process  
- Governance  
- Navigator  
- Hypermedia  
- Flows  
- State transitions  
- Event timelines  

→ **Hub is authoritative**.

---

## **2. Canonical *data tables* and raw entity views**  

This **must** come from **FoundationERP**.

Because:


So for:


→ **FoundationERP is authoritative**.


# 🎯 **So what’s the rule?**

## **Canvas (process-first UI) → Hub first**  
Canvas is about:

- “What state is this entity in?”  

All of this comes from **Integration Hub v2**.

- `/events/entity/:type/:id`

**Canvas = Hub-first.**
---
## Accounting Controls UI (Current)

The SvelteKit Admin route `/admin/accounting-controls` follows the data-first rule for accounting operations:

- Supplier invoices and their posting/reversal journal references come from Foundation ERP entity data.
- Contractor accrual balances are read from the Foundation ERP timesheet accrual endpoint; matching is submitted to the supplier-invoice allocation endpoint through the authenticated server proxy.
- AR, AP, and unbilled-receivable balances come from the Foundation ERP R2R reconciliation endpoint. The UI shows currency comparability and does not display a numeric difference for open foreign-currency balances without translation.
- Process transitions remain Integration Hub actions. The supplier invoice process exposes contractor matching only while Draft or Validated, and cancellation only for eligible states; Foundation ERP remains the final authority for payment and balance guards.

## **Admin (developer/operator cockpit) → FoundationERP first, Hub second**

Admin needs:

### **1. Raw data views**  
→ FoundationERP  
- `/api/v1/...`  
- Direct entity lists  
- Direct entity details  
- Table views  
- Data debugging  

### **2. Flow/event/process views**  
→ Integration Hub  
- Hypermedia  
- Governance  
- Process graphs  
- Navlog  
- Transcript  
- Event streams  

**Admin = FoundationERP first for data, Hub second for flows.**

---

# 🧩 **Why this is the correct architectural split**

### **Hub is the constitutional boundary**  
It knows:

- Governance  
- Actor context  
- Allowed transitions  
- MCP metadata  
- Process state  
- Navigator sessions  

### **FoundationERP is the canonical data store**  
It knows:

- Entity attributes  
- Raw tables  
- Relationships  
- Data integrity  

### **Canvas is process-first**  
So it must use Hub.

### **Admin is data-first + flow-first**  
So it must use both.

---

# 🔥 **Your instinct was correct: we need both.**

You said:

> “I think we need to see both a view of all data from tables views in FoundationERP and we need a flow view of the events from flows.”

Exactly right.

Canvas = flow view  
Admin = data view + flow view  

This is the cleanest separation of concerns.

---

# 📘 **Final Recommendation (copy/paste for developers)**

### **Canvas UI**
```
Use Integration Hub v2 as the primary data source.
FoundationERP is not queried directly.
Canvas is process-first, not data-first.
```

### **Admin Interface**
```
Use FoundationERP for raw data tables and entity views.
Use Integration Hub v2 for process, governance, hypermedia, navlog, and event flows.
Admin is both data-first and flow-first.
```

### **Authoritative Sources**
- **Process state → Hub**
- **Governance → Hub**
- **Allowed transitions → Hub**
- **Navigator sessions → Hub**
- **Event streams → Hub**
- **Raw entity data → FoundationERP**
- **Table views → FoundationERP**


