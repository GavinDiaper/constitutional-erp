-- v2: Upgrade H2R constraints and assignment schema to match v2 services

PRAGMA foreign_keys = OFF;

CREATE TABLE h2r_employee_v2 (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  hire_date TEXT NOT NULL,
  termination_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status IN ('Candidate', 'Active', 'OnLeave', 'Terminated'))
);

INSERT INTO h2r_employee_v2 (
  employee_id,
  name,
  email,
  status,
  hire_date,
  termination_date,
  created_at,
  updated_at
)
SELECT
  employee_id,
  name,
  email,
  status,
  hire_date,
  termination_date,
  created_at,
  updated_at
FROM h2r_employee;

DROP TABLE h2r_employee;
ALTER TABLE h2r_employee_v2 RENAME TO h2r_employee;

CREATE TABLE h2r_assignment_v2 (
  assignment_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  state TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  department TEXT,
  role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(employee_id) REFERENCES h2r_employee(employee_id),
  FOREIGN KEY(position_id) REFERENCES h2r_position(position_id),
  CHECK(state IN ('Planned', 'Active', 'Completed', 'Cancelled'))
);

INSERT INTO h2r_assignment_v2 (
  assignment_id,
  employee_id,
  position_id,
  state,
  start_date,
  end_date,
  department,
  role,
  created_at,
  updated_at
)
SELECT
  assignment_id,
  employee_id,
  position_id,
  CASE
    WHEN state = 'Ended' THEN 'Completed'
    ELSE state
  END,
  start_date,
  end_date,
  NULL,
  NULL,
  created_at,
  updated_at
FROM h2r_assignment;

DROP TABLE h2r_assignment;
ALTER TABLE h2r_assignment_v2 RENAME TO h2r_assignment;

CREATE INDEX IF NOT EXISTS idx_h2r_assignment_employee_state
ON h2r_assignment(employee_id, state);

PRAGMA foreign_keys = ON;
