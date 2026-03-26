import { Router } from "express";
import { z } from "zod";
import { db } from "../db/connection";
import { evaluateAuthority } from "../domain/evaluateAuthority";

const authorityDomainSchema = z.union([z.literal("O2C"), z.literal("P2P"), z.literal("R2R"), z.literal("H2R")]);

const requestSchema = z.object({
  actorId: z.string().min(1),
  action: z.string().min(1),
  domain: authorityDomainSchema,
  context: z.record(z.unknown()).optional()
});

const eligibleApproversQuerySchema = z.object({
  tier: z.coerce.number().int().min(1).max(5),
  domain: authorityDomainSchema
});

export const authorityRouter = Router();

authorityRouter.post("/check", (req, res) => {
  const input = requestSchema.parse(req.body);
  const result = evaluateAuthority(input);
  res.json(result);
});

authorityRouter.get("/eligible-approvers", (req, res) => {
  const query = eligibleApproversQuerySchema.parse(req.query);
  const rows = db
    .prepare(
      `SELECT DISTINCT ap.employee_id AS employeeId
       FROM authority_position ap
       INNER JOIN authority_subject s ON s.employee_id = ap.employee_id
       WHERE ap.authority_domain = ?
         AND ap.authority_tier >= ?
         AND ap.active = 1
         AND s.status = 'Active'
       ORDER BY ap.authority_tier ASC, ap.employee_id ASC`
    )
    .all(query.domain, query.tier) as Array<{ employeeId: string }>;

  res.json({ approvers: rows.map((row) => row.employeeId) });
});
