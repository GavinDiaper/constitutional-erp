CREATE TABLE IF NOT EXISTS h2r_employee (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  hire_date TEXT NOT NULL,
  termination_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status IN ('Active', 'OnLeave', 'Terminated'))
);

CREATE TABLE IF NOT EXISTS h2r_position (
  position_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  authority_domain TEXT NOT NULL,
  authority_tier INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(authority_domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  CHECK(authority_tier BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS h2r_assignment (
  assignment_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  state TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(employee_id) REFERENCES h2r_employee(employee_id),
  FOREIGN KEY(position_id) REFERENCES h2r_position(position_id),
  CHECK(state IN ('Active', 'Ended'))
);

CREATE INDEX IF NOT EXISTS idx_h2r_assignment_employee_state
ON h2r_assignment(employee_id, state);

CREATE TABLE IF NOT EXISTS h2r_credential (
  credential_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_date TEXT NOT NULL,
  expiry_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(employee_id) REFERENCES h2r_employee(employee_id),
  CHECK(status IN ('Valid', 'Expired', 'Revoked'))
);

CREATE INDEX IF NOT EXISTS idx_h2r_credential_employee_status
ON h2r_credential(employee_id, status);

CREATE TABLE IF NOT EXISTS h2r_authority_rule (
  rule_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  threshold REAL NOT NULL,
  required_tier INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(domain IN ('O2C', 'P2P', 'R2R', 'H2R')),
  CHECK(required_tier BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_h2r_authority_rule_domain_threshold
ON h2r_authority_rule(domain, threshold);

INSERT OR IGNORE INTO erp_mapping(mapping_id, domain, entity_name, canonical_field, oracle_field, sap_field, dynamics_field, created_at, updated_at)
VALUES
  ('MAP-H2R-EMP-EMPLOYEEID', 'H2R', 'Employee', 'employeeId', 'PER_ALL_PEOPLE_F.PERSON_ID', 'PA0001-PERNR', 'HcmWorker.RecId', datetime('now'), datetime('now')),
  ('MAP-H2R-EMP-NAME', 'H2R', 'Employee', 'name', 'FULL_NAME', 'NAME', 'PersonName', datetime('now'), datetime('now')),
  ('MAP-H2R-EMP-STATUS', 'H2R', 'Employee', 'status', 'ASSIGNMENT_STATUS', 'STAT2', 'EmploymentStatus', datetime('now'), datetime('now')),
  ('MAP-H2R-POS-POSITIONID', 'H2R', 'Position', 'positionId', 'PER_POSITIONS.POSITION_ID', 'HRP1000-OBJID', 'HcmPosition.RecId', datetime('now'), datetime('now')),
  ('MAP-H2R-POS-TITLE', 'H2R', 'Position', 'title', 'NAME', 'STEXT', 'Title', datetime('now'), datetime('now')),
  ('MAP-H2R-CRED-CREDENTIALID', 'H2R', 'Credential', 'credentialId', 'PER_CERTIFICATIONS.CERTIFICATION_ID', 'HRP1001', 'HcmSkill.RecId', datetime('now'), datetime('now'));
