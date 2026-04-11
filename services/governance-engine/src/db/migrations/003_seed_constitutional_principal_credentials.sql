INSERT OR IGNORE INTO governance_actor_credential(credential_id, actor_id, credential_type, status, expiry_date, created_at, updated_at)
VALUES
  ('GCRD-SYSTEM-FA', 'principal.system', 'FinancialApproval', 'Valid', NULL, datetime('now'), datetime('now')),
  ('GCRD-P2P-TIER3-FA', 'principal.p2p-tier3', 'FinancialApproval', 'Valid', NULL, datetime('now'), datetime('now')),
  ('GCRD-R2R-TIER3-FA', 'principal.r2r-tier3', 'FinancialApproval', 'Valid', NULL, datetime('now'), datetime('now')),
  ('GCRD-H2R-TIER2-HR', 'principal.h2r-tier2', 'HRApproval', 'Valid', NULL, datetime('now'), datetime('now'));