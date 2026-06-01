-- ERP Mapping v2 — Comparison Views
-- Provides pre-built read-only views for gap analysis and cross-system comparison.
-- Views are idempotent: DROP IF EXISTS then CREATE.

-- ---------------------------------------------------------------------------
-- v_field_coverage
-- One row per (canonical field × ERP system).
-- mapping_status = 'GAP' when no erp_field_mapping row exists for that system.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_field_coverage;
CREATE VIEW v_field_coverage AS
SELECT
  cf.field_id,
  cf.domain,
  ce.entity_name,
  cf.canonical_field,
  cf.field_type,
  cf.is_key,
  es.system_id,
  es.name                                        AS system_name,
  es.vendor,
  es.generation,
  COALESCE(fm.mapping_status, 'GAP')             AS mapping_status,
  fm.erp_module,
  fm.erp_table,
  fm.erp_field,
  fm.erp_full_reference,
  fm.transformation_notes,
  fm.is_bidirectional
FROM erp_canonical_field  cf
JOIN erp_canonical_entity ce ON ce.entity_id = cf.entity_id
CROSS JOIN erp_system     es
LEFT JOIN erp_field_mapping fm
  ON  fm.field_id   = cf.field_id
  AND fm.system_id  = es.system_id;

-- ---------------------------------------------------------------------------
-- v_system_gap_report
-- Per-domain, per-system coverage summary.
-- Shows total canonical fields, how many are mapped, and coverage %.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_system_gap_report;
CREATE VIEW v_system_gap_report AS
SELECT
  fc.domain,
  fc.system_id,
  fc.system_name,
  fc.vendor,
  COUNT(*)                                                   AS total_fields,
  SUM(CASE WHEN fc.mapping_status = 'MAPPED'         THEN 1 ELSE 0 END) AS mapped,
  SUM(CASE WHEN fc.mapping_status = 'PARTIAL'        THEN 1 ELSE 0 END) AS partial,
  SUM(CASE WHEN fc.mapping_status = 'NOT_APPLICABLE' THEN 1 ELSE 0 END) AS not_applicable,
  SUM(CASE WHEN fc.mapping_status = 'GAP'            THEN 1 ELSE 0 END) AS gap,
  ROUND(
    100.0 * SUM(CASE WHEN fc.mapping_status IN ('MAPPED','PARTIAL') THEN 1 ELSE 0 END)
    / NULLIF(COUNT(*), 0), 1
  )                                                          AS coverage_pct
FROM v_field_coverage fc
GROUP BY fc.domain, fc.system_id, fc.system_name, fc.vendor;

-- ---------------------------------------------------------------------------
-- v_cross_system_field_compare
-- Pivot-style view — one row per canonical field, one column per core system.
-- Useful for rendering a comparison grid in the UI.
-- Core systems: FUSION, EBS, SAP_S4, SAP_ECC, WORKDAY, D365FO
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_cross_system_field_compare;
CREATE VIEW v_cross_system_field_compare AS
SELECT
  cf.field_id,
  cf.domain,
  ce.entity_name,
  cf.canonical_field,
  cf.field_type,
  cf.is_key,
  -- Oracle Fusion
  MAX(CASE WHEN fm.system_id = 'FUSION'   THEN fm.erp_full_reference END) AS fusion_field,
  MAX(CASE WHEN fm.system_id = 'FUSION'   THEN fm.mapping_status     END) AS fusion_status,
  -- Oracle EBS
  MAX(CASE WHEN fm.system_id = 'EBS'      THEN fm.erp_full_reference END) AS ebs_field,
  MAX(CASE WHEN fm.system_id = 'EBS'      THEN fm.mapping_status     END) AS ebs_status,
  -- SAP S/4HANA
  MAX(CASE WHEN fm.system_id = 'SAP_S4'   THEN fm.erp_full_reference END) AS sap_s4_field,
  MAX(CASE WHEN fm.system_id = 'SAP_S4'   THEN fm.mapping_status     END) AS sap_s4_status,
  -- SAP ECC
  MAX(CASE WHEN fm.system_id = 'SAP_ECC'  THEN fm.erp_full_reference END) AS sap_ecc_field,
  MAX(CASE WHEN fm.system_id = 'SAP_ECC'  THEN fm.mapping_status     END) AS sap_ecc_status,
  -- Workday
  MAX(CASE WHEN fm.system_id = 'WORKDAY'  THEN fm.erp_full_reference END) AS workday_field,
  MAX(CASE WHEN fm.system_id = 'WORKDAY'  THEN fm.mapping_status     END) AS workday_status,
  -- Dynamics 365 F&O
  MAX(CASE WHEN fm.system_id = 'D365FO'   THEN fm.erp_full_reference END) AS d365fo_field,
  MAX(CASE WHEN fm.system_id = 'D365FO'   THEN fm.mapping_status     END) AS d365fo_status,
  -- NetSuite
  MAX(CASE WHEN fm.system_id = 'NETSUITE' THEN fm.erp_full_reference END) AS netsuite_field,
  MAX(CASE WHEN fm.system_id = 'NETSUITE' THEN fm.mapping_status     END) AS netsuite_status,
  -- Odoo
  MAX(CASE WHEN fm.system_id = 'ODOO'     THEN fm.erp_full_reference END) AS odoo_field,
  MAX(CASE WHEN fm.system_id = 'ODOO'     THEN fm.mapping_status     END) AS odoo_status
FROM erp_canonical_field   cf
JOIN erp_canonical_entity  ce ON ce.entity_id  = cf.entity_id
LEFT JOIN erp_field_mapping fm ON fm.field_id  = cf.field_id
GROUP BY cf.field_id, cf.domain, ce.entity_name, cf.canonical_field, cf.field_type, cf.is_key;

-- ---------------------------------------------------------------------------
-- v_process_coverage
-- Per-process, per-system implementation status.
-- mapping_status = 'GAP' when no process_system_mapping row exists.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_process_coverage;
CREATE VIEW v_process_coverage AS
SELECT
  ep.process_id,
  ep.domain,
  ep.process_name,
  ep.canonical_command,
  ep.sequence_order,
  es.system_id,
  es.name                                        AS system_name,
  es.vendor,
  COALESCE(psm.mapping_status, 'GAP')            AS mapping_status,
  psm.erp_process_name,
  psm.erp_transaction_code,
  psm.erp_module,
  psm.notes
FROM erp_process                  ep
CROSS JOIN erp_system             es
LEFT JOIN erp_process_system_mapping psm
  ON  psm.process_id = ep.process_id
  AND psm.step_id    IS NULL          -- header-level only in this view
  AND psm.system_id  = es.system_id;

-- ---------------------------------------------------------------------------
-- v_gap_fields_by_system
-- Convenience view — only shows canonical fields with no mapping for a system.
-- Filter by system_id to get the full gap list for any ERP.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_gap_fields_by_system;
CREATE VIEW v_gap_fields_by_system AS
SELECT
  fc.system_id,
  fc.system_name,
  fc.vendor,
  fc.domain,
  fc.entity_name,
  fc.canonical_field,
  fc.field_type,
  fc.is_key
FROM v_field_coverage fc
WHERE fc.mapping_status = 'GAP';

-- ---------------------------------------------------------------------------
-- v_system_specific_fields
-- Shows ERP-native fields that have no canonical equivalent, grouped by system.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_system_specific_fields;
CREATE VIEW v_system_specific_fields AS
SELECT
  sf.system_id,
  es.name      AS system_name,
  es.vendor,
  sf.domain,
  sf.entity_context,
  sf.erp_module,
  sf.erp_full_reference,
  sf.purpose,
  sf.notes
FROM erp_system_field sf
JOIN erp_system       es ON es.system_id = sf.system_id;
