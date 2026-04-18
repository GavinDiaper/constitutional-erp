UPDATE authority_subject
SET
  name = 'Gavin Diaper',
  email = 'gavin.diaper@gmail.com',
  status = 'Active',
  updated_at = datetime('now')
WHERE employee_id = 'principal.system';
