import { Router } from "express";
import { z } from "zod";
import { canonicalEventSchema, canonicalSourceSystemSchema } from "../contracts/canonicalSchemas";
import { appendCanonicalEvent, listLedgerEvents } from "../domain/ledgerStore";

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

const ingestSchema = z.object({
  events: z.array(canonicalEventSchema).min(1)
});

eventRouter.post("/events/ingest", (req, res, next) => {
  try {
    const body = ingestSchema.parse(req.body);
    let inserted = 0;
    let duplicates = 0;

    for (const event of body.events) {
      const wasInserted = appendCanonicalEvent(event);
      if (wasInserted) {
        inserted += 1;
      } else {
        duplicates += 1;
      }
    }

    res.status(202).json({
      status: "accepted",
      inserted,
      duplicates
    });
  } catch (error) {
    next(error);
  }
});