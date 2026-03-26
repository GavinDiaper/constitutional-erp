import { McpFunctionDef } from "./catalog";

export const h2rFunctions: McpFunctionDef[] = [
  { name: "h2r_create_employee", domain: "h2r", description: "Create employee" },
  { name: "h2r_place_on_leave", domain: "h2r", description: "Place employee on leave" },
  { name: "h2r_return_from_leave", domain: "h2r", description: "Return employee from leave" },
  { name: "h2r_terminate_employee", domain: "h2r", description: "Terminate employee" },
  { name: "h2r_create_position", domain: "h2r", description: "Create position" },
  { name: "h2r_assign_position", domain: "h2r", description: "Assign position to employee" },
  { name: "h2r_end_assignment", domain: "h2r", description: "End assignment" },
  { name: "h2r_issue_credential", domain: "h2r", description: "Issue credential" },
  { name: "h2r_expire_credential", domain: "h2r", description: "Expire credential" },
  { name: "h2r_revoke_credential", domain: "h2r", description: "Revoke credential" },
  { name: "h2r_create_authority_rule", domain: "h2r", description: "Create authority rule" }
];
