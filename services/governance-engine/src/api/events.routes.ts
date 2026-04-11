import { Router } from "express";
import { listGovernanceEvents } from "../events/eventStore";

export const eventRouter = Router();

eventRouter.get("/events", (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const after = typeof req.query.after === "string" ? req.query.after : undefined;
  const rows = listGovernanceEvents(limit, after);
  res.json({ data: rows });
});
