-- ERP System Catalog seed data.
-- Covers the major commercial and open-source ERP systems that the
-- Canonical ERP seeks to map.  Additive and idempotent via INSERT OR IGNORE.

INSERT OR IGNORE INTO erp_system(system_id, name, vendor, generation, category, erp_version, notes, created_at, updated_at)
VALUES
  -- Oracle Cloud (Fusion)
  ('FUSION',   'Oracle Fusion Cloud ERP',              'Oracle',    'Cloud',       'Tier1', '24D',              'Formerly Oracle Fusion Applications. Cloud-native, unified suite.', datetime('now'), datetime('now')),

  -- Oracle E-Business Suite (on-premise legacy)
  ('EBS',      'Oracle E-Business Suite',              'Oracle',    'On-Premise',  'Tier1', '12.2',             'Legacy on-premise suite. Different table names to Fusion (OE_*, RA_*, AP_* etc.).', datetime('now'), datetime('now')),

  -- SAP S/4HANA (current generation — cloud and on-premise)
  ('SAP_S4',   'SAP S/4HANA',                         'SAP',       'Hybrid',      'Tier1', '2023',             'In-memory ERP on HANA. Universal Journal (ACDOCA) replaces FI/CO split tables.', datetime('now'), datetime('now')),

  -- SAP ECC (legacy on-premise, still widely deployed)
  ('SAP_ECC',  'SAP ECC 6.0',                         'SAP',       'On-Premise',  'Tier1', 'EHP8',             'Classic SAP ERP Central Component. Separate FI (BKPF/BSEG) and CO tables.', datetime('now'), datetime('now')),

  -- Workday
  ('WORKDAY',  'Workday Financial Management',         'Workday',   'Cloud',       'Tier1', '2024R1',           'Object-based model with business process framework. No SQL tables exposed directly.', datetime('now'), datetime('now')),

  -- Microsoft Dynamics 365 Finance & Operations
  ('D365FO',   'Dynamics 365 Finance & Operations',   'Microsoft', 'Cloud',       'Tier1', '10.0.39',          'X++ AOT-based tables. Previously AX 2012. Seeded as ''dynamics_field'' in legacy erp_mapping.', datetime('now'), datetime('now')),

  -- Microsoft Dynamics 365 Business Central
  ('D365BC',   'Dynamics 365 Business Central',       'Microsoft', 'Cloud',       'Tier2', '24',               'SME-focused, formerly Navision/NAV. AL language, different table structure to D365FO.', datetime('now'), datetime('now')),

  -- Oracle NetSuite
  ('NETSUITE', 'Oracle NetSuite',                     'Oracle',    'Cloud',       'Tier2', '2024.1',           'Cloud ERP for mid-market. SuiteQL for data access. Custom Record types for extensions.', datetime('now'), datetime('now')),

  -- Odoo (open source)
  ('ODOO',     'Odoo Community / Enterprise',         'Odoo',      'Hybrid',      'OpenSource', '17',          'Python/PostgreSQL. Community edition is LGPL. Modular, widely customised.', datetime('now'), datetime('now')),

  -- Sage Intacct
  ('INTACCT',  'Sage Intacct',                        'Sage',      'Cloud',       'Tier2', '2024',             'Cloud-first, API-driven. Strong multi-entity / multi-currency for services firms.', datetime('now'), datetime('now'));
