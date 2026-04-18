# Constitutional‑safe spec for Project BOM, Internal Trade, and Labour Costing

> “This roadmap is intentionally shaped around your architectural philosophy: **process‑first, event‑sourced, governance‑aware, and ERP‑agnostic.**”   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  

This spec assumes your existing **two‑layer inventory architecture**: constitutional inventory in the core, operational modules outside it.   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  

---

## 1. Scope and constitutional boundaries

**In scope (constitutional core):**

- **Item & BOM primitives:**  
  **Item (SKU)**, **Item Category**, **Unit of Measure**, **BOM header & components**, **valuation method**, **on‑hand**, **item cost**.   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  
- **Inventory events:**  
  **Receipt**, **Issue**, **Adjustment**, **Cost update**, **COGS recognition**, all event‑sourced.  
- **Project manufacturing substrate:**  
  Ability for a **project** to consume components and create a **finished SKU** (project WIP → finished good).  
- **Internal trade:**  
  Canonical pattern for **internal PO/SO** between inventory and project domains.  
- **Labour as cost element:**  
  Labour cost events posted to **Project WIP**, not inventory.   [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  
- **SLA posting:**  
  Inventory, COGS, WIP, GRNI, internal revenue/charge, etc.

**Out of scope (modular / non‑constitutional):**

- WMS, reservations, advanced costing, MRP, etc. (remain as optional modules).   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  

---

## 2. Core entities and master data

### 2.1 Item & BOM

- **Item (SKU):**  
  **Fields:** canonical item ID, description, category, UoM, valuation method, active/inactive, inventory flag.  
- **BOM Header:**  
  **Fields:** parent item, revision, effective dates, project‑eligible flag, costing profile.  
- **BOM Component:**  
  **Fields:** component item (SKU), quantity per, scrap %, component type = `MATERIAL` | `LABOR_COST` | `OTHER_COST`.  
- **Cost Element:**  
  **Fields:** cost element ID, type (`MATERIAL`, `LABOR`, `OVERHEAD`), GL mapping, tax attributes.   [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  

### 2.2 Project & WIP

- **Project:**  
  **Fields:** project ID, customer, contract, WBS, default WIP account, revenue recognition method.   [SAP Community](https://community.sap.com/t5/product-lifecycle-management-blog-posts-by-sap/how-integrated-project-cost-and-revenue-planning-helps-to-keep-your/ba-p/13763494)  
- **Project WIP Object:**  
  Logical bucket for accumulating **material + labour + overhead** costs for a given deliverable (e.g., project line or WBS element).

---

## 3. Event model (constitutional)

### 3.1 Inventory events

- **inv.item.created**  
- **inv.receipt.posted**  
- **inv.issue.posted**  
- **inv.adjustment.posted**  
- **inv.cost.updated**  
- **inv.cogs.recognized**

All are **event‑sourced**, replayable, and carry:

- **Common fields:** event_id, timestamp, item_id, quantity, unit_cost, total_cost, org/warehouse, source_system.  
- **Project context (optional):** project_id, wbs_id, project_wip_id, bom_id, bom_component_flag.   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  

### 3.2 Project & labour events

- **proj.bom.assigned**  
  Links a BOM to a project/WBS or project deliverable.  
- **proj.material.issued**  
  Wrapper over `inv.issue.posted` with project context.  
- **proj.wip.created / proj.wip.closed**  
- **proj.labor.costed**  
  `{ project_id, wbs_id, resource_id, hours, rate, total_cost, cost_element_id }`   [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  
- **proj.finished_item.created**  
  Creates a finished SKU instance for the project (or marks standard SKU as produced for that project).

### 3.3 Internal trade events

- **itr.internal_po.created**  
- **itr.internal_so.created**  
- **itr.internal_receipt.posted**  
- **itr.internal_issue.posted**

These are **commercial wrappers** around inventory and project events, used when you want explicit internal pricing/charge.   [SAP Community](https://community.sap.com/t5/product-lifecycle-management-blog-posts-by-sap/how-integrated-project-cost-and-revenue-planning-helps-to-keep-your/ba-p/13763494)  

---

## 4. Core process flows

### 4.1 BOM assignment to project

1. **Project created**  
   - `proj.project.created` with WBS and WIP defaults.  
2. **BOM linked to project deliverable**  
   - `proj.bom.assigned (project_id, wbs_id, bom_id, quantity_planned)`  
3. **Cost planning (optional, but canonical):**  
   - Planned material and labour costs derived from BOM and labour rates.   [SAP Community](https://community.sap.com/t5/product-lifecycle-management-blog-posts-by-sap/how-integrated-project-cost-and-revenue-planning-helps-to-keep-your/ba-p/13763494)  

### 4.2 Material consumption to project (without internal trade pricing)

1. **Issue components from inventory:**  
   - `inv.issue.posted` with `{ project_id, project_wip_id, bom_component_flag=true }`.  
2. **SLA posting:**  
   - DR **Project WIP – Material**  
   - CR **Inventory Asset**  
3. **On‑hand updated** via event replay.

This is the **simplest canonical pattern**—no internal revenue, just cost transfer.

### 4.3 Material consumption via internal trade (with internal pricing)

1. **Internal PO (Project → Inventory):**  
   - `itr.internal_po.created (project_id, supplier_org=Inventory, price)`  
2. **Internal SO (Inventory → Project):**  
   - `itr.internal_so.created (selling_org=Inventory, customer=Project)`  
3. **Goods issue / receipt:**  
   - `inv.issue.posted` (inventory org)  
   - `inv.receipt.posted` (project stock or direct WIP)  
4. **SLA postings (example):**  
   - DR **Project WIP – Material** (at internal transfer price)  
   - CR **Internal Revenue – Inventory Org**  
   - DR **COGS – Internal**  
   - CR **Inventory Asset**

This pattern is optional but **ERP‑canonical** for internal charge‑out models.

### 4.4 Labour costing to project

1. **Time entry / payroll integration:**  
   - Source system (time or payroll) produces `proj.labor.costed`.   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  
2. **SLA posting:**  
   - DR **Project WIP – Labour**  
   - CR **Payroll Clearing / Labour Expense** (depending on your design).  
3. **No inventory movement, no on‑hand, no valuation method.**  
   Labour is purely a **cost element**.

### 4.5 Project manufacturing – finished item creation

1. **Project signals completion of deliverable:**  
   - `proj.finished_item.created (project_id, item_id, quantity, total_wip_cost)`  
2. **Inventory receipt:**  
   - `inv.receipt.posted` for finished item, cost = aggregated WIP (material + labour + overhead).  
3. **SLA posting:**  
   - DR **Inventory Asset – Finished Goods**  
   - CR **Project WIP – Total**  
4. **Project WIP object closed** (or reduced by quantity).

This mirrors **project manufacturing / project stock** patterns in SAP PS and Oracle Projects.   [SAP Community](https://community.sap.com/t5/product-lifecycle-management-blog-posts-by-sap/how-integrated-project-cost-and-revenue-planning-helps-to-keep-your/ba-p/13763494)  [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  

### 4.6 Sale and COGS

1. **Sales order & shipment:**  
   - O2C creates shipment event referencing the finished item.  
2. **COGS recognition:**  
   - `inv.cogs.recognized (item_id, project_id?, cost)`  
3. **SLA posting:**  
   - DR **COGS**  
   - CR **Inventory Asset – Finished Goods**  
4. **Revenue recognition:**  
   - DR **AR**  
   - CR **Revenue**  
   - Project margin = Revenue – (WIP rolled into inventory → COGS).

---

## 5. Posting profiles and accounting model

### 5.1 Core posting profiles

- **Inventory Asset**  
- **COGS**  
- **Inventory Adjustments**  
- **GRNI**  
- **Project WIP – Material**  
- **Project WIP – Labour**  
- **Internal Revenue / Internal COGS** (if internal trade pricing used)  
- **Payroll / Labour Expense / Clearing**   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  

### 5.2 SLA templates (illustrative)

- **Material issue to project:**  
  - DR Project WIP – Material  
  - CR Inventory Asset  

- **Labour cost to project:**  
  - DR Project WIP – Labour  
  - CR Payroll / Labour Expense  

- **WIP to finished goods:**  
  - DR Inventory Asset – Finished Goods  
  - CR Project WIP – Total  

- **COGS on sale:**  
  - DR COGS  
  - CR Inventory Asset – Finished Goods  

These are parameterised by **posting profile**, not hard‑coded, so mapping to SAP/Oracle/D365 is straightforward.

---

## 6. Governance, integration, and extensibility

### 6.1 Governance

- **High‑risk events:**  
  - Inventory adjustments, cost updates, WIP revaluations, internal transfer prices.  
- **Authority tiers:**  
  - Each event carries `risk_level` and `required_authority_tier`.  
- **Audit:**  
  - All project, inventory, and labour events are immutable and replayable.

> “Inventory transactions are naturally event‑sourced: Receive 10, Issue 4, Adjust +1, On‑hand = 7. This is deterministic and replayable.”   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  

### 6.2 Canonical integration contracts

- **Canonical SKU**  
- **Canonical inventory event**  
- **Canonical cost / labour cost event**  
- **Canonical project cost line** (for external PS/Projects modules).   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  [SAP Community](https://community.sap.com/t5/product-lifecycle-management-blog-posts-by-sap/how-integrated-project-cost-and-revenue-planning-helps-to-keep-your/ba-p/13763494)  

Mappings:

- To **SAP**: PS WBS, project stock, cost elements, internal orders.   [SAP Community](https://community.sap.com/t5/product-lifecycle-management-blog-posts-by-sap/how-integrated-project-cost-and-revenue-planning-helps-to-keep-your/ba-p/13763494)  [SAP Project System](https://www.sap-ps.net/cost-and-revenue-planning)  
- To **Oracle**: Projects, Inventory, Payroll cost distribution.   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  
- To **Dynamics**: Project Operations, Inventory, cost categories.

### 6.3 Extensibility

- **Operational inventory modules** (WMS, reservations, lot/serial, quality) consume and emit the same **core events**, but remain optional.   [docs.oracle.com](https://docs.oracle.com/en/cloud/saas/readiness/erp/24a/ppm24a/24A-ppm-wn-f30826.htm)  
- **Planning modules** (MRP, project planning, CPQ) use BOM + cost elements but do not mutate constitutional state directly.

