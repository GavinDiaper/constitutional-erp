import { Router } from "express";
import { z } from "zod";
import { db } from "../db/connection";

export const parametersRouter = Router();

const updateSchema = z.object({
  value: z.number().finite().positive(),
  updatedBy: z.string().min(1).optional()
});

parametersRouter.get("/parameters", (_req, res) => {
  res.json({ data: db.prepare("SELECT key, value, description, updated_by, updated_at FROM governance_parameter ORDER BY key").all() });
});

parametersRouter.put("/parameters/:key", (req, res) => {
  const body = updateSchema.parse(req.body);
  const result = db
    .prepare("UPDATE governance_parameter SET value = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?")
    .run(body.value, body.updatedBy ?? null, req.params.key);
  if (result.changes === 0) {
    res.status(404).json({ title: "parameter_not_found", status: 404 });
    return;
  }
  res.json({ key: req.params.key, value: body.value });
});
