import express from "express";
import helmet from "helmet";
import { eventRouter } from "./api/events.routes";
import { queryRouter } from "./api/query.routes";
import { replayRouter } from "./api/replay.routes";
import { statusRouter } from "./api/status.routes";
import { loadConfig } from "./config/env";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { readinessGate } from "./middleware/readinessGate";
import { getReplayError, getReplayStatus } from "./projection/runtimeState";
import { toProblem } from "./utils/errors";

const defaultConfig = loadConfig();

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const replayStatus = getReplayStatus();
    res.json({
      status: replayStatus === "Ready" ? "ok" : "degraded",
      service: "event-processor",
      replayStatus,
      replayError: replayStatus === "Failed" ? getReplayError() : undefined
    });
  });

  app.use("/api/v1", apiKeyAuth(defaultConfig.apiKey));
  app.use("/api/v1/status", statusRouter);
  app.use("/api/v1", queryRouter);
  app.use("/api/v1", readinessGate(), eventRouter);
  app.use("/api/v1", readinessGate(), replayRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}