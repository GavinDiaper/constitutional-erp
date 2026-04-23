# Canonical to ERP Mapping (Seed-Aligned)

This document is aligned to the seeded canonical-to-ERP mapping rows in Foundation ERP.

## Source of truth

The authoritative mapping values are in SQL migration seeds:

- `services/foundation-erp/src/db/migrations/005_h2r.sql`
- `services/foundation-erp/src/db/migrations/027_seed_erp_mapping_all_domains.sql`

These rows are persisted in `erp_mapping` (`services/foundation-erp/src/db/migrations/001_init.sql`) and are replay-safe via `INSERT OR IGNORE`.

## Coverage summary (seeded)

Current seeded total: **383 mappings**

- O2C: 60
- P2P: 54
- R2R (including tax): 96
- H2R: 25
- INV: 80
- PROJ: 68

All seeded rows include all three ERP target columns:

- `oracle_field`
- `sap_field`
- `dynamics_field`

## Entity coverage by domain

### O2C

- Customer (6)
- Quote (6)
- QuoteLine (6)
- SalesOrder (7)
- SalesOrderLine (6)
- Invoice (11)
- InvoiceLine (5)
- Payment (7)
- Shipment (6)

### P2P

- Supplier (7)
- Requisition (8)
- RequisitionLine (5)
- PurchaseOrder (8)
- PurchaseOrderLine (5)
- GoodsReceipt (4)
- SupplierInvoice (9)
- APPayment (8)

### R2R (including tax)

- Account (6)
- FiscalYear (3)
- FiscalPeriod (4)
- Journal (5)
- JournalLine (5)
- LedgerEntry (4)
- TrialBalanceRow (3)
- Ledger (6)
- LegalEntity (4)
- LedgerSet (2)
- LedgerSetMember (2)
- COASegmentDefinition (3)
- AccountSegmentValue (3)
- COACombinationRule (3)
- COACombinationRuleCondition (3)
- FXRateType (2)
- FXRate (5)
- SLAPostingProfile (3)
- SLAPostingProfileLine (4)
- TaxRegime (3)
- TaxJurisdiction (3)
- TaxCode (3)
- TaxRate (3)
- TaxRule (4)
- TaxAccountMapping (4)
- TaxTransactionLine (6)

### H2R

- Employee (6)
- Position (5)
- Assignment (6)
- Credential (4)
- AuthorityRule (4)

### INV

- SKU (8)
- InventoryOrganization (5)
- OnHand (6)
- InventoryMovement (9)
- Reservation (8)
- Bin (5)
- BinBalance (5)
- BinTransaction (8)
- CycleCount (6)
- CycleCountLine (6)
- Lot (8)
- Serial (6)

### PROJ

- Project (12)
- ProjectWIP (8)
- BOMHeader (8)
- BOMComponent (9)
- CostElement (8)
- ProjectBOMAssignment (6)
- ProjectLaborEntry (9)
- ProjectFinishedItem (8)

## Validation queries

Use these queries to verify DB values and doc coverage stay aligned.

```sql
-- total mappings
SELECT COUNT(*) AS total_count FROM erp_mapping;

-- per-domain counts
SELECT domain, COUNT(*) AS row_count
FROM erp_mapping
GROUP BY domain
ORDER BY domain;

-- per-entity counts
SELECT domain, entity_name, COUNT(*) AS row_count
FROM erp_mapping
GROUP BY domain, entity_name
ORDER BY domain, entity_name;

-- uniqueness checks
SELECT mapping_id, COUNT(*)
FROM erp_mapping
GROUP BY mapping_id
HAVING COUNT(*) > 1;

SELECT domain, entity_name, canonical_field, COUNT(*)
FROM erp_mapping
GROUP BY domain, entity_name, canonical_field
HAVING COUNT(*) > 1;
```

## Maintenance rules

1. Seed-first policy: update mapping migrations before editing this document.
2. Keep this document synchronized with the SQL seed set and verification counts.
3. Do not rewrite historical migrations; add forward migrations for mapping changes.
4. Ensure each seeded row has non-null Oracle/SAP/Dynamics target fields.

