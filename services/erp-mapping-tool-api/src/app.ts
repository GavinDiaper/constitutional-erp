import express from "express";
import helmet from "helmet";
import { loadConfig } from "./config/env";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { queryRouter } from "./api/query.routes";
import { mappingsRouter } from "./api/mappings.routes";
import { toProblem } from "./utils/errors";
import { runMigrations } from "./db/migrate";

const config = loadConfig();

function applyCors(req: express.Request, res: express.Response): void {
  const requestOrigin = req.headers.origin;
  const allowOrigin =
    requestOrigin && config.corsOrigins.includes(requestOrigin)
      ? requestOrigin
      : config.corsOrigins[0] ?? "*";

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key,x-actor-id,x-actor-tier");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
}

export function createApp() {
  runMigrations();

  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.use((req, res, next) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "erp-mapping-tool-api" });
  });

  app.use("/api/v1", apiKeyAuth(config.apiKey));
  app.use("/api/v1", queryRouter);
  app.use("/api/v1", mappingsRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
