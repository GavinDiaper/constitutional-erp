-- ERP Mapping v2 Schema
-- Normalises the flat erp_mapping table into a fully relational, multi-system
-- comparison model that supports field-level and process-level gap analysis.
-- Additive only: the legacy erp_mapping table is preserved for backwards compat.

-- ---------------------------------------------------------------------------
-- 1. erp_system — catalog of all ERP products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_system (
  system_id   TEXT PRIMARY KEY,  -- e.g. FUSION, EBS, SAP_S4, WORKDAY
  name        TEXT NOT NULL,     -- full product name
  vendor      TEXT NOT NULL,     -- Oracle, SAP, Microsoft, Workday, Odoo, ...
  generation  TEXT NOT NULL,     -- Cloud | On-Premise | Hybrid
  category    TEXT NOT NULL,     -- Tier1 | Tier2 | OpenSource
  erp_version TEXT,              -- e.g. '24D', 'S/4HANA 2023', '6.0 EHP8'
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. erp_canonical_entity — one row per canonical domain entity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_canonical_entity (
  entity_id   TEXT PRIMARY KEY,  -- e.g. O2C-CUSTOMER
  domain      TEXT NOT NULL,     -- O2C | P2P | R2R | H2R | INV | PROJ
  entity_name TEXT NOT NULL,     -- Customer, SalesOrder, ...
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_canonical_entity_domain
  ON erp_canonical_entity(domain);

-- ---------------------------------------------------------------------------
-- 3. erp_canonical_field — normalised field registry
--    Mirrors the existing erp_mapping rows but without ERP-specific columns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_canonical_field (
  field_id        TEXT PRIMARY KEY,  -- e.g. O2C-CUSTOMER-CUSTOMERID (= legacy mapping_id)
  entity_id       TEXT NOT NULL REFERENCES erp_canonical_entity(entity_id),
  domain          TEXT NOT NULL,
  canonical_field TEXT NOT NULL,     -- camelCase field name
  field_type      TEXT NOT NULL DEFAULT 'TEXT',  -- TEXT | NUMBER | DATE | BOOLEAN | ENUM
  is_key          INTEGER NOT NULL DEFAULT 0,    -- 1 = primary key of the entity
  description     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_canonical_field_entity
  ON erp_canonical_field(entity_id);

CREATE INDEX IF NOT EXISTS idx_erp_canonical_field_domain
  ON erp_canonical_field(domain);

-- ---------------------------------------------------------------------------
-- 4. erp_field_mapping — one row per (canonical field × ERP system)
--    Replaces the fixed oracle_field / sap_field / dynamics_field columns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_field_mapping (
  id                   TEXT PRIMARY KEY,
  field_id             TEXT NOT NULL REFERENCES erp_canonical_field(field_id),
  system_id            TEXT NOT NULL REFERENCES erp_system(system_id),
  erp_module           TEXT,   -- e.g. 'Accounts Receivable', 'SD', 'AR'
  erp_table            TEXT,   -- e.g. 'HZ_PARTIES', 'KNA1', 'CustTable'
  erp_field            TEXT,   -- e.g. 'PARTY_ID', 'KUNNR', 'AccountNum'
  erp_full_reference   TEXT,   -- dot-notation e.g. 'HZ_PARTIES.PARTY_ID'
  mapping_status       TEXT NOT NULL DEFAULT 'MAPPED',
                       -- MAPPED | PARTIAL | NOT_APPLICABLE | GAP
  transformation_notes TEXT,   -- e.g. 'truncate to 10 chars', 'reverse lookup via T-table'
  is_bidirectional     INTEGER NOT NULL DEFAULT 1,  -- 1 = round-trip supported
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE(field_id, system_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_field_mapping_field
  ON erp_field_mapping(field_id);

CREATE INDEX IF NOT EXISTS idx_erp_field_mapping_system
  ON erp_field_mapping(system_id);

CREATE INDEX IF NOT EXISTS idx_erp_field_mapping_status
  ON erp_field_mapping(mapping_status);

-- ---------------------------------------------------------------------------
-- 5. erp_system_field — ERP-native fields with NO canonical equivalent
--    Documents what canonical ERP intentionally does not model.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_system_field (
  id               TEXT PRIMARY KEY,
  system_id        TEXT NOT NULL REFERENCES erp_system(system_id),
  domain           TEXT NOT NULL,   -- best-fit domain label
  entity_context   TEXT NOT NULL,   -- ERP entity this field belongs to
  erp_module       TEXT,
  erp_table        TEXT,
  erp_field        TEXT NOT NULL,
  erp_full_reference TEXT,
  purpose          TEXT NOT NULL,   -- what this field does in that ERP
  notes            TEXT,            -- why there is no canonical equivalent
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_system_field_system
  ON erp_system_field(system_id);

CREATE INDEX IF NOT EXISTS idx_erp_system_field_domain
  ON erp_system_field(domain);

-- ---------------------------------------------------------------------------
-- 6. erp_process — canonical process catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_process (
  process_id        TEXT PRIMARY KEY,  -- e.g. O2C-CREATE-SALES-ORDER
  domain            TEXT NOT NULL,
  process_name      TEXT NOT NULL,     -- 'Create Sales Order'
  canonical_command TEXT,              -- maps to PGE commandId concept
  description       TEXT,
  sequence_order    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_process_domain
  ON erp_process(domain);

-- ---------------------------------------------------------------------------
-- 7. erp_process_step — sub-steps within a canonical process
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_process_step (
  step_id        TEXT PRIMARY KEY,  -- e.g. O2C-CREATE-SALES-ORDER-STEP-01
  process_id     TEXT NOT NULL REFERENCES erp_process(process_id),
  step_name      TEXT NOT NULL,     -- 'Validate Customer Credit'
  description    TEXT,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_erp_process_step_process
  ON erp_process_step(process_id);

-- ---------------------------------------------------------------------------
-- 8. erp_process_system_mapping — per-system implementation of a canonical
--    process or step.  step_id is nullable (NULL = header-level mapping).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_process_system_mapping (
  id                  TEXT PRIMARY KEY,
  process_id          TEXT NOT NULL REFERENCES erp_process(process_id),
  step_id             TEXT REFERENCES erp_process_step(step_id),
  system_id           TEXT NOT NULL REFERENCES erp_system(system_id),
  erp_process_name    TEXT,   -- ERP's own label for this process
  erp_transaction_code TEXT,  -- SAP T-code (VA01), Workday BP name, API path
  erp_module          TEXT,   -- 'Order Management Cloud', 'SD', 'Sales'
  mapping_status      TEXT NOT NULL DEFAULT 'MAPPED',
                      -- MAPPED | PARTIAL | NOT_APPLICABLE | GAP
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE(process_id, step_id, system_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_psm_process
  ON erp_process_system_mapping(process_id);

CREATE INDEX IF NOT EXISTS idx_erp_psm_system
  ON erp_process_system_mapping(system_id);
