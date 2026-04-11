import { Router } from "express";
import { evaluateGovernance, governanceCheckInputSchema } from "../domain/evaluateGovernance";

export const governanceRouter = Router();

governanceRouter.post("/evaluate", (req, res) => {
  const input = governanceCheckInputSchema.parse(req.body);
  const result = evaluateGovernance(input);
  res.json(result);
});
