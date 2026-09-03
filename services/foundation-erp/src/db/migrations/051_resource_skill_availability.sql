ALTER TABLE proj_task ADD COLUMN required_skill TEXT;
ALTER TABLE proj_task_allocation ADD COLUMN work_date TEXT;

CREATE TABLE IF NOT EXISTS h2r_employee_skill (
  skill_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES h2r_employee(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_employee_skill_employee ON h2r_employee_skill(employee_id);
CREATE INDEX IF NOT EXISTS idx_h2r_employee_skill_name ON h2r_employee_skill(skill_name);

CREATE TABLE IF NOT EXISTS h2r_employee_availability (
  availability_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  available_hours REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, work_date),
  FOREIGN KEY (employee_id) REFERENCES h2r_employee(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_h2r_employee_availability_employee_date ON h2r_employee_availability(employee_id, work_date);
