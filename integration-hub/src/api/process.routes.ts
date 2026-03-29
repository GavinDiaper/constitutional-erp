import { Router } from "express";
import { z } from "zod";
import { validateInputAgainstSchema } from "../domain/inputValidation";
import { McpCatalog } from "../domain/mcpCatalog";
import { ProcessFacade } from "../domain/processFacade";
import { HttpError } from "../utils/errors";

const pathSchema = z.object({
  entity: z.string().min(1),
  id: z.string().min(1)
});

const actionPathSchema = pathSchema.extend({
  action: z.string().min(1)
});

export function createProcessRouter(catalog: McpCatalog, processFacade: ProcessFacade) {
  const router = Router();

  router.get("/:entity/:id", async (req, res, next) => {
    try {
      const params = pathSchema.parse(req.params ?? {});
      const actorId = req.header("x-actor-id") ?? undefined;
      const data = await processFacade.getProcess(params.entity, params.id, actorId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:entity/:id/actions/:action", async (req, res, next) => {
    try {
      const params = actionPathSchema.parse(req.params ?? {});
      const actorId = req.header("x-actor-id") ?? undefined;
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const fn = catalog.getByEntityAndAction(params.entity, params.action);

      if (!fn) {
        throw new HttpError(404, "action_not_found", `No MCP function mapped for ${params.entity}.${params.action}`);
      }

      const inputErrors = validateInputAgainstSchema(fn.inputSchema, payload);
      if (inputErrors.length > 0) {
        throw new HttpError(400, "invalid_input", inputErrors.join("; "));
      }

      const result = await processFacade.executeAction({
        entity: params.entity,
        id: params.id,
        action: params.action,
        payload,
        actorId
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
