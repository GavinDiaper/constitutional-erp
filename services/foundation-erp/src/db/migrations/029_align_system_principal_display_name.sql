UPDATE h2r_employee
SET
  name = 'Gavin Diaper',
  email = 'gavin.diaper@gmail.com',
  status = 'Active',
  termination_date = NULL,
  updated_at = datetime('now')
WHERE employee_id = 'principal.system';
