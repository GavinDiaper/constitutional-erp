import { Router } from "express";
import { z } from "zod";
import { canonicalSourceSystemSchema } from "../contracts/canonicalSchemas";
import { listLedgerEvents } from "../domain/ledgerStore";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional(),
  after: z.string().datetime().optional(),
  sourceSystem: canonicalSourceSystemSchema.optional(),
  domain: z.string().min(1).optional(),
  aggregateType: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional()
});

export const eventRouter = Router();

eventRouter.get("/events", (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const rows = listLedgerEvents(query);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});