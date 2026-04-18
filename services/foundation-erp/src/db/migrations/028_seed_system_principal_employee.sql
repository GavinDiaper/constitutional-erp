INSERT OR IGNORE INTO h2r_employee (
  employee_id,
  name,
  email,
  status,
  hire_date,
  termination_date,
  created_at,
  updated_at
)
VALUES (
  'principal.system',
  'Constitutional System Principal',
  'gavin.diaper@gmail.com',
  'Active',
  date('now'),
  NULL,
  datetime('now'),
  datetime('now')
);

UPDATE h2r_employee
SET
  name = 'Constitutional System Principal',
  email = 'gavin.diaper@gmail.com',
  status = 'Active',
  termination_date = NULL,
  updated_at = datetime('now')
WHERE employee_id = 'principal.system';
