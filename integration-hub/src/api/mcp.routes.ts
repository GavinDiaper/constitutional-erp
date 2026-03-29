import { Router } from "express";
import { McpCatalog } from "../domain/mcpCatalog";
import { HttpError } from "../utils/errors";

export function createMcpRouter(catalog: McpCatalog) {
  const router = Router();

  router.get("/functions", (_req, res) => {
    res.json({
      version: "1.0.0",
      functions: catalog.list()
    });
  });

  router.get("/functions/:id", (req, res, next) => {
    try {
      const fn = catalog.getById(req.params["id"]);
      if (!fn) {
        throw new HttpError(404, "mcp_function_not_found", `Unknown MCP function id: ${req.params["id"]}`);
      }

      res.json(fn);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
