import { Router } from "express";
import { z } from "zod";
import { evaluateAuthority } from "../domain/evaluateAuthority";

const authorityDomainSchema = z.union([z.literal("O2C"), z.literal("P2P"), z.literal("R2R"), z.literal("H2R")]);

const requestSchema = z.object({
  actorId: z.string().min(1),
  action: z.string().min(1),
  domain: authorityDomainSchema,
  context: z.record(z.unknown()).optional()
});

export const authorityRouter = Router();

authorityRouter.post("/check", (req, res) => {
  const input = requestSchema.parse(req.body);
  const result = evaluateAuthority(input);
  res.json(result);
});
