-- Migrate existing erp_mapping data into the v2 normalised tables.
-- Uses INSERT ... SELECT to derive all rows from the legacy table.
-- Additive and idempotent via INSERT OR IGNORE.
--
-- After this migration:
--   erp_canonical_entity  — 1 row per (domain, entity_name) pair
--   erp_canonical_field   — 1 row per legacy erp_mapping row (field_id = mapping_id)
--   erp_field_mapping     — 3 rows per canonical field:
--                             system_id = FUSION   (oracle_field column)
--                             system_id = SAP_S4   (sap_field column)
--                             system_id = D365FO   (dynamics_field column)
--
-- NOTE: the oracle_field column in the legacy seed data uses Oracle Fusion Cloud
-- table names (DOO_HEADERS_ALL, HZ_PARTIES, EGP_SYSTEM_ITEMS_B etc.),
-- confirming FUSION as the correct system_id.

-- ---------------------------------------------------------------------------
-- Step 1: erp_canonical_entity
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_canonical_entity(entity_id, domain, entity_name, description, created_at, updated_at)
SELECT DISTINCT
  domain || '-' || upper(replace(entity_name, ' ', '-'))  AS entity_id,
  domain,
  entity_name,
  NULL,
  datetime('now'),
  datetime('now')
FROM erp_mapping;

-- ---------------------------------------------------------------------------
-- Step 2: erp_canonical_field  (field_id = legacy mapping_id)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_canonical_field(field_id, entity_id, domain, canonical_field, field_type, is_key, description, created_at, updated_at)
SELECT
  mapping_id                                                          AS field_id,
  domain || '-' || upper(replace(entity_name, ' ', '-'))             AS entity_id,
  domain,
  canonical_field,
  CASE
    WHEN lower(canonical_field) LIKE '%id'       THEN 'TEXT'
    WHEN lower(canonical_field) LIKE '%date'     THEN 'DATE'
    WHEN lower(canonical_field) LIKE '%amount'   THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%qty'      THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%quantity' THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%cost'     THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%price'    THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%value'    THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%rate'     THEN 'NUMBER'
    WHEN lower(canonical_field) LIKE '%flag'     THEN 'BOOLEAN'
    WHEN lower(canonical_field) LIKE '%active'   THEN 'BOOLEAN'
    WHEN lower(canonical_field) = 'state'        THEN 'ENUM'
    WHEN lower(canonical_field) = 'status'       THEN 'ENUM'
    ELSE 'TEXT'
  END                                                                 AS field_type,
  -- mark as key if the field name equals the entity primary key convention
  CASE
    WHEN mapping_id LIKE '%-' || upper(canonical_field)
      AND lower(canonical_field) LIKE '%id'
      AND instr(mapping_id, upper(replace(entity_name, ' ', ''))) > 0
    THEN 1 ELSE 0
  END                                                                 AS is_key,
  NULL,
  datetime('now'),
  datetime('now')
FROM erp_mapping;

-- ---------------------------------------------------------------------------
-- Step 3a: erp_field_mapping — Oracle Fusion (from oracle_field column)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_field_mapping(
  id, field_id, system_id,
  erp_module, erp_table, erp_field, erp_full_reference,
  mapping_status, transformation_notes, is_bidirectional,
  created_at, updated_at
)
SELECT
  'FM-FUSION-' || mapping_id                                         AS id,
  mapping_id                                                          AS field_id,
  'FUSION'                                                            AS system_id,
  -- derive module from table prefix where recognisable
  CASE
    WHEN oracle_field LIKE 'AR_%'   OR oracle_field LIKE 'RA_%'      THEN 'Accounts Receivable'
    WHEN oracle_field LIKE 'AP_%'                                     THEN 'Accounts Payable'
    WHEN oracle_field LIKE 'GL_%'                                     THEN 'General Ledger'
    WHEN oracle_field LIKE 'HZ_%'                                     THEN 'Trading Community Architecture'
    WHEN oracle_field LIKE 'DOO_%'                                    THEN 'Order Management'
    WHEN oracle_field LIKE 'POZ_%' OR oracle_field LIKE 'PO_%'       THEN 'Procurement'
    WHEN oracle_field LIKE 'POR_%'                                    THEN 'Purchasing Requisitions'
    WHEN oracle_field LIKE 'WSH_%'                                    THEN 'Shipping'
    WHEN oracle_field LIKE 'INV_%'                                    THEN 'Inventory'
    WHEN oracle_field LIKE 'EGP_%' OR oracle_field LIKE 'CST_%'      THEN 'Product Hub / Costing'
    WHEN oracle_field LIKE 'PER_%' OR oracle_field LIKE 'HR_%'       THEN 'Human Capital Management'
    WHEN oracle_field LIKE 'ZX_%'                                     THEN 'Tax'
    WHEN oracle_field LIKE 'FUN_%'                                    THEN 'Financials Common'
    WHEN oracle_field LIKE 'PJF_%' OR oracle_field LIKE 'PJO_%'      THEN 'Project Management'
    WHEN oracle_field LIKE 'BOM_%'                                    THEN 'Manufacturing / BOM'
    ELSE 'Oracle Fusion'
  END                                                                 AS erp_module,
  substr(oracle_field, 1,
    CASE WHEN instr(oracle_field, '.') > 0
         THEN instr(oracle_field, '.') - 1
         ELSE length(oracle_field) END)                               AS erp_table,
  CASE WHEN instr(oracle_field, '.') > 0
       THEN substr(oracle_field, instr(oracle_field, '.') + 1)
       ELSE NULL END                                                  AS erp_field,
  oracle_field                                                        AS erp_full_reference,
  'MAPPED',
  NULL,
  1,
  datetime('now'),
  datetime('now')
FROM erp_mapping
WHERE oracle_field IS NOT NULL AND oracle_field != '';

-- ---------------------------------------------------------------------------
-- Step 3b: erp_field_mapping — SAP S/4HANA (from sap_field column)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_field_mapping(
  id, field_id, system_id,
  erp_module, erp_table, erp_field, erp_full_reference,
  mapping_status, transformation_notes, is_bidirectional,
  created_at, updated_at
)
SELECT
  'FM-SAP-S4-' || mapping_id                                         AS id,
  mapping_id                                                          AS field_id,
  'SAP_S4'                                                            AS system_id,
  CASE
    WHEN sap_field LIKE 'KNA%' OR sap_field LIKE 'VBAK%' OR sap_field LIKE 'VBUK%'
      OR sap_field LIKE 'VBRK%' OR sap_field LIKE 'VBRP%' OR sap_field LIKE 'VBPA%'
      OR sap_field LIKE 'LIPS%' OR sap_field LIKE 'LIKP%'           THEN 'Sales & Distribution (SD)'
    WHEN sap_field LIKE 'LFA%' OR sap_field LIKE 'LFB%' OR sap_field LIKE 'LFM%'
      OR sap_field LIKE 'EKKO%' OR sap_field LIKE 'EKPO%' OR sap_field LIKE 'EBAN%'
      OR sap_field LIKE 'MIGO%'                                      THEN 'Materials Management (MM)'
    WHEN sap_field LIKE 'BKPF%' OR sap_field LIKE 'BSEG%'
      OR sap_field LIKE 'BSID%' OR sap_field LIKE 'BSAD%'
      OR sap_field LIKE 'BSIK%' OR sap_field LIKE 'BSAK%'
      OR sap_field LIKE 'SKA1%' OR sap_field LIKE 'SKAT%'
      OR sap_field LIKE 'T001%' OR sap_field LIKE 'FAGL%'
      OR sap_field LIKE 'ACDOCA%'                                    THEN 'Financial Accounting (FI)'
    WHEN sap_field LIKE 'CSKS%' OR sap_field LIKE 'CSKU%'
      OR sap_field LIKE 'COSP%' OR sap_field LIKE 'COSS%'           THEN 'Controlling (CO)'
    WHEN sap_field LIKE 'PA%'                                        THEN 'Human Resources (HR)'
    WHEN sap_field LIKE 'MARA%' OR sap_field LIKE 'MAKT%'
      OR sap_field LIKE 'MARC%' OR sap_field LIKE 'MARD%'
      OR sap_field LIKE 'MBEW%' OR sap_field LIKE 'MSEG%'           THEN 'Inventory Management (IM)'
    WHEN sap_field LIKE 'CRMD%'                                      THEN 'CRM / Sales (CRM)'
    WHEN sap_field LIKE 'KONV%'                                      THEN 'Pricing (SD)'
    WHEN sap_field LIKE 'ADR%'                                       THEN 'Address Management (BC-SRV-ADR)'
    WHEN sap_field LIKE 'T030%' OR sap_field LIKE 'T042%'           THEN 'Account Determination'
    WHEN sap_field LIKE 'PROJ%' OR sap_field LIKE 'PRPS%'
      OR sap_field LIKE 'AUFK%'                                      THEN 'Project System (PS)'
    ELSE 'SAP S/4HANA'
  END                                                                 AS erp_module,
  -- SAP uses TABLENAME-FIELDNAME dash notation
  CASE WHEN instr(sap_field, '-') > 0
       THEN substr(sap_field, 1, instr(sap_field, '-') - 1)
       ELSE sap_field END                                             AS erp_table,
  CASE WHEN instr(sap_field, '-') > 0
       THEN substr(sap_field, instr(sap_field, '-') + 1)
       ELSE NULL END                                                  AS erp_field,
  sap_field                                                           AS erp_full_reference,
  'MAPPED',
  NULL,
  1,
  datetime('now'),
  datetime('now')
FROM erp_mapping
WHERE sap_field IS NOT NULL AND sap_field != '';

-- ---------------------------------------------------------------------------
-- Step 3c: erp_field_mapping — Dynamics 365 F&O (from dynamics_field column)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO erp_field_mapping(
  id, field_id, system_id,
  erp_module, erp_table, erp_field, erp_full_reference,
  mapping_status, transformation_notes, is_bidirectional,
  created_at, updated_at
)
SELECT
  'FM-D365FO-' || mapping_id                                         AS id,
  mapping_id                                                          AS field_id,
  'D365FO'                                                            AS system_id,
  CASE
    WHEN dynamics_field LIKE 'CustTable%' OR dynamics_field LIKE 'CustTrans%'
      OR dynamics_field LIKE 'CustInvoice%' OR dynamics_field LIKE 'CustSettlement%'
      OR dynamics_field LIKE 'SalesTable%' OR dynamics_field LIKE 'SalesLine%'
      OR dynamics_field LIKE 'SalesQuotation%'                       THEN 'Accounts Receivable / Sales'
    WHEN dynamics_field LIKE 'VendTable%' OR dynamics_field LIKE 'VendTrans%'
      OR dynamics_field LIKE 'VendInvoice%' OR dynamics_field LIKE 'PurchTable%'
      OR dynamics_field LIKE 'PurchLine%' OR dynamics_field LIKE 'PurchReq%'
      OR dynamics_field LIKE 'VendPaym%'                             THEN 'Accounts Payable / Procurement'
    WHEN dynamics_field LIKE 'LedgerJournalTable%' OR dynamics_field LIKE 'LedgerJournalTrans%'
      OR dynamics_field LIKE 'MainAccount%' OR dynamics_field LIKE 'Ledger.%'
      OR dynamics_field LIKE 'FiscalCalendar%' OR dynamics_field LIKE 'DimensionValue%'
      OR dynamics_field LIKE 'GeneralJournal%'                       THEN 'General Ledger'
    WHEN dynamics_field LIKE 'HcmWorker%' OR dynamics_field LIKE 'HcmPosition%'
      OR dynamics_field LIKE 'HcmEmployment%'                        THEN 'Human Resources'
    WHEN dynamics_field LIKE 'InventTable%' OR dynamics_field LIKE 'InventSum%'
      OR dynamics_field LIKE 'InventTrans%' OR dynamics_field LIKE 'WMSLocation%'
      OR dynamics_field LIKE 'InventSite%'                           THEN 'Inventory Management'
    WHEN dynamics_field LIKE 'ProjTable%' OR dynamics_field LIKE 'ProjCost%'
      OR dynamics_field LIKE 'ProjEmpl%'                             THEN 'Project Management'
    WHEN dynamics_field LIKE 'TaxTrans%' OR dynamics_field LIKE 'TaxTable%' THEN 'Tax'
    WHEN dynamics_field LIKE 'WMSShipment%' OR dynamics_field LIKE 'SalesParm%' THEN 'Warehouse Management'
    WHEN dynamics_field LIKE 'CompanyInfo%' OR dynamics_field LIKE 'Logistics%'  THEN 'Organization Administration'
    ELSE 'Dynamics 365 F&O'
  END                                                                 AS erp_module,
  CASE WHEN instr(dynamics_field, '.') > 0
       THEN substr(dynamics_field, 1, instr(dynamics_field, '.') - 1)
       ELSE dynamics_field END                                        AS erp_table,
  CASE WHEN instr(dynamics_field, '.') > 0
       THEN substr(dynamics_field, instr(dynamics_field, '.') + 1)
       ELSE NULL END                                                  AS erp_field,
  dynamics_field                                                      AS erp_full_reference,
  'MAPPED',
  NULL,
  1,
  datetime('now'),
  datetime('now')
FROM erp_mapping
WHERE dynamics_field IS NOT NULL AND dynamics_field != '';
