INSERT OR IGNORE INTO authority_subject(employee_id, name, email, status, created_at, updated_at)
VALUES
  ('principal.system', 'Constitutional System Principal', 'principal.system@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.p2p-tier1', 'P2P Tier 1 Principal', 'principal.p2p-tier1@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.p2p-tier3', 'P2P Tier 3 Principal', 'principal.p2p-tier3@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.o2c-tier2', 'O2C Tier 2 Principal', 'principal.o2c-tier2@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.h2r-tier2', 'H2R Tier 2 Principal', 'principal.h2r-tier2@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.r2r-tier3', 'R2R Tier 3 Principal', 'principal.r2r-tier3@constitutional.local', 'Active', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO position_def(position_id, title, department, authority_domain, authority_tier, created_at, updated_at)
VALUES
  ('POS-SYSTEM-P2P-5', 'System Principal P2P Tier 5', 'Constitutional', 'P2P', 5, datetime('now'), datetime('now')),
  ('POS-SYSTEM-O2C-5', 'System Principal O2C Tier 5', 'Constitutional', 'O2C', 5, datetime('now'), datetime('now')),
  ('POS-SYSTEM-H2R-5', 'System Principal H2R Tier 5', 'Constitutional', 'H2R', 5, datetime('now'), datetime('now')),
  ('POS-SYSTEM-R2R-5', 'System Principal R2R Tier 5', 'Constitutional', 'R2R', 5, datetime('now'), datetime('now')),
  ('POS-P2P-TIER1', 'P2P Tier 1 Principal Position', 'Procurement', 'P2P', 1, datetime('now'), datetime('now')),
  ('POS-P2P-TIER3', 'P2P Tier 3 Principal Position', 'Procurement', 'P2P', 3, datetime('now'), datetime('now')),
  ('POS-O2C-TIER2', 'O2C Tier 2 Principal Position', 'Sales', 'O2C', 2, datetime('now'), datetime('now')),
  ('POS-H2R-TIER2', 'H2R Tier 2 Principal Position', 'HR', 'H2R', 2, datetime('now'), datetime('now')),
  ('POS-R2R-TIER3', 'R2R Tier 3 Principal Position', 'Finance', 'R2R', 3, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO authority_position(assignment_id, employee_id, position_id, authority_domain, authority_tier, active, created_at, updated_at)
VALUES
  ('ASG-SYSTEM-P2P-5', 'principal.system', 'POS-SYSTEM-P2P-5', 'P2P', 5, 1, datetime('now'), datetime('now')),
  ('ASG-SYSTEM-O2C-5', 'principal.system', 'POS-SYSTEM-O2C-5', 'O2C', 5, 1, datetime('now'), datetime('now')),
  ('ASG-SYSTEM-H2R-5', 'principal.system', 'POS-SYSTEM-H2R-5', 'H2R', 5, 1, datetime('now'), datetime('now')),
  ('ASG-SYSTEM-R2R-5', 'principal.system', 'POS-SYSTEM-R2R-5', 'R2R', 5, 1, datetime('now'), datetime('now')),
  ('ASG-P2P-TIER1', 'principal.p2p-tier1', 'POS-P2P-TIER1', 'P2P', 1, 1, datetime('now'), datetime('now')),
  ('ASG-P2P-TIER3', 'principal.p2p-tier3', 'POS-P2P-TIER3', 'P2P', 3, 1, datetime('now'), datetime('now')),
  ('ASG-O2C-TIER2', 'principal.o2c-tier2', 'POS-O2C-TIER2', 'O2C', 2, 1, datetime('now'), datetime('now')),
  ('ASG-H2R-TIER2', 'principal.h2r-tier2', 'POS-H2R-TIER2', 'H2R', 2, 1, datetime('now'), datetime('now')),
  ('ASG-R2R-TIER3', 'principal.r2r-tier3', 'POS-R2R-TIER3', 'R2R', 3, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO authority_credential(credential_id, employee_id, credential_type, status, expiry_date, created_at, updated_at)
VALUES
  ('CRD-SYSTEM-FA', 'principal.system', 'FinancialApproval', 'Valid', NULL, datetime('now'), datetime('now')),
  ('CRD-P2P-TIER3-FA', 'principal.p2p-tier3', 'FinancialApproval', 'Valid', NULL, datetime('now'), datetime('now')),
  ('CRD-R2R-TIER3-FA', 'principal.r2r-tier3', 'FinancialApproval', 'Valid', NULL, datetime('now'), datetime('now'));