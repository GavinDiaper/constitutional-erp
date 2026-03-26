import express from "express";
import helmet from "helmet";
import { authorityRouter } from "./api/authority.routes";
import { eventRouter } from "./api/events.routes";
import { loadConfig } from "./config/env";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { readinessGate } from "./middleware/readinessGate";
import { getReplayError, getReplayStatus } from "./projection/state";
import { toProblem } from "./utils/errors";

const config = loadConfig();

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const replayStatus = getReplayStatus();
    res.json({
      status: replayStatus === "Ready" ? "ok" : "degraded",
      service: "authority-engine",
      replayStatus,
      replayError: replayStatus === "Failed" ? getReplayError() : undefined
    });
  });

  app.use("/authority", apiKeyAuth(config.apiKey), readinessGate(), authorityRouter);
  app.use("/api/v1", apiKeyAuth(config.apiKey), eventRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
