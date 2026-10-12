ALTER TABLE proj_project ADD COLUMN contract_version_id TEXT;

UPDATE proj_project
SET contract_version_id = (
  SELECT contract_version_id
  FROM o2c_contract_version
  WHERE o2c_contract_version.contract_id = proj_project.contract_id
    AND o2c_contract_version.status = 'Approved'
  ORDER BY version_number DESC
  LIMIT 1
)
WHERE project_type = 'Service' AND contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proj_project_contract_version ON proj_project(contract_version_id);