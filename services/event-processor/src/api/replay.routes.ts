import { Router } from "express";
import { z } from "zod";
import { applyUpcasters } from "../contracts/upcasting";
import { getAggregateStream } from "../domain/ledgerStore";

const aggregateReplayQuerySchema = z.object({
  domain: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1)
});

export const replayRouter = Router();

replayRouter.get("/replay/aggregate", (req, res, next) => {
  try {
    const query = aggregateReplayQuerySchema.parse(req.query);
    const rows = getAggregateStream(query.domain, query.aggregateType, query.aggregateId).map((event) => applyUpcasters(event));
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});