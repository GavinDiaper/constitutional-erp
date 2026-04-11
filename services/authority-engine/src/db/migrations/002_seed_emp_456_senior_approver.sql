INSERT OR IGNORE INTO authority_subject(employee_id, name, email, status, created_at, updated_at)
VALUES (
  'EMP-456',
  'Senior Approver',
  'emp-456@constitutional.local',
  'Active',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO position_def(position_id, title, department, authority_domain, authority_tier, created_at, updated_at)
VALUES (
  'POS-P2P-SENIOR-4',
  'Senior P2P Approver',
  'Procurement',
  'P2P',
  4,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO authority_position(
  assignment_id,
  employee_id,
  position_id,
  authority_domain,
  authority_tier,
  active,
  created_at,
  updated_at
)
VALUES (
  'ASG-EMP-456-P2P-4',
  'EMP-456',
  'POS-P2P-SENIOR-4',
  'P2P',
  4,
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO authority_credential(credential_id, employee_id, credential_type, status, expiry_date, created_at, updated_at)
VALUES (
  'CRD-EMP-456-FA',
  'EMP-456',
  'FinancialApproval',
  'Valid',
  NULL,
  datetime('now'),
  datetime('now')
);
