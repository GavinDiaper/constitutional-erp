INSERT OR IGNORE INTO authority_action_rule(domain, resource_type, action, required_tier) VALUES
  ('INV', 'inventory-movement', 'adjust', 2),
  ('INV', 'inventory-movement', 'cost_update', 3),
  ('H2R', 'vendor-rate', 'create', 4),
  ('H2R', 'employee-cost-rate', 'create', 4),
  ('H2R', 'authority-rule', 'create', 4),
  ('H2R', 'timesheet-import', 'import', 4),
  ('H2R', 'timesheet-import', 'commit', 4),
  ('PROJ', 'milestone', 'approve', 2),
  ('PROJ', 'change-request', 'approve', 2);

INSERT OR IGNORE INTO authority_subject(employee_id, name, email, status, created_at, updated_at) VALUES
  ('principal.inv-tier1', 'Inventory Tier 1 Principal', 'principal.inv-tier1@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.inv-tier2', 'Inventory Tier 2 Principal', 'principal.inv-tier2@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.inv-tier3', 'Inventory Tier 3 Principal', 'principal.inv-tier3@constitutional.local', 'Active', datetime('now'), datetime('now')),
  ('principal.h2r-tier4', 'H2R Tier 4 Principal', 'principal.h2r-tier4@constitutional.local', 'Active', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO position_def(position_id, title, department, authority_domain, authority_tier, created_at, updated_at) VALUES
  ('POS-INV-TIER1', 'Inventory Tier 1 Principal Position', 'Warehouse', 'INV', 1, datetime('now'), datetime('now')),
  ('POS-INV-TIER2', 'Inventory Tier 2 Principal Position', 'Warehouse', 'INV', 2, datetime('now'), datetime('now')),
  ('POS-INV-TIER3', 'Inventory Tier 3 Principal Position', 'Warehouse', 'INV', 3, datetime('now'), datetime('now')),
  ('POS-H2R-TIER4', 'H2R Tier 4 Principal Position', 'HR', 'H2R', 4, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO authority_position(assignment_id, employee_id, position_id, authority_domain, authority_tier, active, created_at, updated_at) VALUES
  ('ASG-INV-TIER1', 'principal.inv-tier1', 'POS-INV-TIER1', 'INV', 1, 1, datetime('now'), datetime('now')),
  ('ASG-INV-TIER2', 'principal.inv-tier2', 'POS-INV-TIER2', 'INV', 2, 1, datetime('now'), datetime('now')),
  ('ASG-INV-TIER3', 'principal.inv-tier3', 'POS-INV-TIER3', 'INV', 3, 1, datetime('now'), datetime('now')),
  ('ASG-H2R-TIER4', 'principal.h2r-tier4', 'POS-H2R-TIER4', 'H2R', 4, 1, datetime('now'), datetime('now'));
