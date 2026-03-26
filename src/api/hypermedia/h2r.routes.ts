import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import {
  createEmployee,
  getEmployeeById,
  listEmployees,
  placeEmployeeOnLeave,
  returnEmployeeFromLeave,
  terminateEmployee
} from "../../domain/h2r/employee/employeeService";
import { createPosition, getPositionById, listPositions } from "../../domain/h2r/position/positionService";
import { createAssignment, endAssignment, getAssignmentById, listAssignments } from "../../domain/h2r/assignment/assignmentService";
import {
  expireCredential,
  getCredentialById,
  issueCredential,
  listCredentials,
  revokeCredential
} from "../../domain/h2r/credential/credentialService";
import {
  createAuthorityRule,
  getAuthorityRuleById,
  listAuthorityRules
} from "../../domain/h2r/authorityRule/authorityRuleService";

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

const createPositionSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  authorityDomain: z.enum(["O2C", "P2P", "R2R", "H2R"]),
  authorityTier: z.number().int().min(1).max(5)
});

const createAssignmentSchema = z.object({
  employeeId: z.string().min(1),
  positionId: z.string().min(1)
});

const issueCredentialSchema = z.object({
  employeeId: z.string().min(1),
  type: z.string().min(1),
  expiryDate: z.string().optional()
});

const createAuthorityRuleSchema = z.object({
  domain: z.enum(["O2C", "P2P", "R2R", "H2R"]),
  threshold: z.number().nonnegative(),
  requiredTier: z.number().int().min(1).max(5)
});

function employeeLinks(employeeId: string, status: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/h2r/employees/${employeeId}`, method: "GET" }
  };

  if (status === "Active") {
    links["place-on-leave"] = {
      href: `/api/v1/h2r/employees/${employeeId}/leave`,
      method: "POST",
      mcpFunction: "h2r_place_on_leave"
    };
    links["terminate"] = {
      href: `/api/v1/h2r/employees/${employeeId}/terminate`,
      method: "POST",
      mcpFunction: "h2r_terminate_employee"
    };
  }

  if (status === "OnLeave") {
    links["return-from-leave"] = {
      href: `/api/v1/h2r/employees/${employeeId}/return`,
      method: "POST",
      mcpFunction: "h2r_return_from_leave"
    };
    links["terminate"] = {
      href: `/api/v1/h2r/employees/${employeeId}/terminate`,
      method: "POST",
      mcpFunction: "h2r_terminate_employee"
    };
  }

  return links;
}

function assignmentLinks(assignmentId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/h2r/assignments/${assignmentId}`, method: "GET" }
  };

  if (state === "Active") {
    links["end-assignment"] = {
      href: `/api/v1/h2r/assignments/${assignmentId}/end`,
      method: "POST",
      mcpFunction: "h2r_end_assignment"
    };
  }

  return links;
}

function credentialLinks(credentialId: string, status: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/h2r/credentials/${credentialId}`, method: "GET" }
  };

  if (status === "Valid") {
    links["expire"] = {
      href: `/api/v1/h2r/credentials/${credentialId}/expire`,
      method: "POST",
      mcpFunction: "h2r_expire_credential"
    };
    links["revoke"] = {
      href: `/api/v1/h2r/credentials/${credentialId}/revoke`,
      method: "POST",
      mcpFunction: "h2r_revoke_credential"
    };
  }

  return links;
}

export const h2rRouter = Router();

h2rRouter.get("/employees", (_req, res) => {
  const employees = listEmployees().map((row: any) =>
    entityWithLinks(row, employeeLinks(row.employee_id, row.status))
  );

  res.json({ data: employees });
});

h2rRouter.get("/employees/:employeeId", (req, res) => {
  const employee = getEmployeeById(req.params.employeeId);
  res.json(entityWithLinks(employee as any, employeeLinks(req.params.employeeId, (employee as any).status)));
});

h2rRouter.post("/employees", validateBody(createEmployeeSchema), (req, res) => {
  const employee = createEmployee(req.body);
  res.status(201).json(entityWithLinks(employee as any, employeeLinks((employee as any).employee_id, (employee as any).status)));
});

h2rRouter.post("/employees/:employeeId/leave", (req, res) => {
  const employee = placeEmployeeOnLeave(req.params.employeeId);
  res.json(entityWithLinks(employee as any, employeeLinks(req.params.employeeId, (employee as any).status)));
});

h2rRouter.post("/employees/:employeeId/return", (req, res) => {
  const employee = returnEmployeeFromLeave(req.params.employeeId);
  res.json(entityWithLinks(employee as any, employeeLinks(req.params.employeeId, (employee as any).status)));
});

h2rRouter.post("/employees/:employeeId/terminate", (req, res) => {
  const employee = terminateEmployee(req.params.employeeId);
  res.json(entityWithLinks(employee as any, employeeLinks(req.params.employeeId, (employee as any).status)));
});

h2rRouter.get("/positions", (_req, res) => {
  const positions = listPositions().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/h2r/positions/${row.position_id}`, method: "GET" } })
  );

  res.json({ data: positions });
});

h2rRouter.get("/positions/:positionId", (req, res) => {
  const position = getPositionById(req.params.positionId);
  res.json(entityWithLinks(position as any, { self: { href: `/api/v1/h2r/positions/${req.params.positionId}`, method: "GET" } }));
});

h2rRouter.post("/positions", validateBody(createPositionSchema), (req, res) => {
  const position = createPosition(req.body);
  res.status(201).json(entityWithLinks(position as any, { self: { href: `/api/v1/h2r/positions/${(position as any).position_id}`, method: "GET" } }));
});

h2rRouter.get("/assignments", (req, res) => {
  const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
  const assignments = listAssignments(employeeId).map((row: any) =>
    entityWithLinks(row, assignmentLinks(row.assignment_id, row.state))
  );

  res.json({ data: assignments });
});

h2rRouter.get("/assignments/:assignmentId", (req, res) => {
  const assignment = getAssignmentById(req.params.assignmentId);
  res.json(entityWithLinks(assignment as any, assignmentLinks(req.params.assignmentId, (assignment as any).state)));
});

h2rRouter.post("/assignments", validateBody(createAssignmentSchema), (req, res) => {
  const assignment = createAssignment(req.body);
  res.status(201).json(entityWithLinks(assignment as any, assignmentLinks((assignment as any).assignment_id, (assignment as any).state)));
});

h2rRouter.post("/assignments/:assignmentId/end", (req, res) => {
  const assignment = endAssignment(req.params.assignmentId);
  res.json(entityWithLinks(assignment as any, assignmentLinks(req.params.assignmentId, (assignment as any).state)));
});

h2rRouter.get("/credentials", (req, res) => {
  const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
  const credentials = listCredentials(employeeId).map((row: any) =>
    entityWithLinks(row, credentialLinks(row.credential_id, row.status))
  );

  res.json({ data: credentials });
});

h2rRouter.get("/credentials/:credentialId", (req, res) => {
  const credential = getCredentialById(req.params.credentialId);
  res.json(entityWithLinks(credential as any, credentialLinks(req.params.credentialId, (credential as any).status)));
});

h2rRouter.post("/credentials", validateBody(issueCredentialSchema), (req, res) => {
  const credential = issueCredential(req.body);
  res.status(201).json(entityWithLinks(credential as any, credentialLinks((credential as any).credential_id, (credential as any).status)));
});

h2rRouter.post("/credentials/:credentialId/expire", (req, res) => {
  const credential = expireCredential(req.params.credentialId);
  res.json(entityWithLinks(credential as any, credentialLinks(req.params.credentialId, (credential as any).status)));
});

h2rRouter.post("/credentials/:credentialId/revoke", (req, res) => {
  const credential = revokeCredential(req.params.credentialId);
  res.json(entityWithLinks(credential as any, credentialLinks(req.params.credentialId, (credential as any).status)));
});

h2rRouter.get("/authority-rules", (req, res) => {
  const domain = typeof req.query.domain === "string" ? req.query.domain : undefined;
  const rules = listAuthorityRules(domain as "O2C" | "P2P" | "R2R" | "H2R" | undefined).map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/h2r/authority-rules/${row.rule_id}`, method: "GET" } })
  );

  res.json({ data: rules });
});

h2rRouter.get("/authority-rules/:ruleId", (req, res) => {
  const rule = getAuthorityRuleById(req.params.ruleId);
  res.json(entityWithLinks(rule as any, { self: { href: `/api/v1/h2r/authority-rules/${req.params.ruleId}`, method: "GET" } }));
});

h2rRouter.post("/authority-rules", validateBody(createAuthorityRuleSchema), (req, res) => {
  const rule = createAuthorityRule(req.body);
  res.status(201).json(entityWithLinks(rule as any, { self: { href: `/api/v1/h2r/authority-rules/${(rule as any).rule_id}`, method: "GET" } }));
});
