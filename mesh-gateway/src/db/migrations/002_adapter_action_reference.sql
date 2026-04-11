ALTER TABLE mesh_approval_task ADD COLUMN adapter_id TEXT;
ALTER TABLE mesh_approval_task ADD COLUMN resource_type TEXT;
ALTER TABLE mesh_approval_task ADD COLUMN mesh_action_path TEXT;

UPDATE mesh_approval_task
SET adapter_id = COALESCE(adapter_id, 'foundation')
WHERE adapter_id IS NULL OR adapter_id = '';

UPDATE mesh_approval_task
SET mesh_action_path = CASE
  WHEN original_request_path LIKE '/api/v1/%' THEN REPLACE(original_request_path, '/api/v1/', '/mesh/')
  ELSE original_request_path
END
WHERE mesh_action_path IS NULL OR mesh_action_path = '';

UPDATE mesh_approval_task
SET resource_type = COALESCE(resource_type, '')
WHERE resource_type IS NULL;
