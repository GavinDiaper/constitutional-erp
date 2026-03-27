import express from "express";
import helmet from "helmet";
import { approvalsRouter } from "./api/approvals.routes";
import { graphRouter } from "./api/graph.routes";
import { loadConfig } from "./config/env";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { readinessGate } from "./middleware/readinessGate";
import { getReplayError, getReplayStatus } from "./projection/runtimeState";
import { toProblem } from "./utils/errors";

const config = loadConfig();

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  // Health endpoint – always available (no auth, no readiness gate)
  app.get("/health", (_req, res) => {
    const status = getReplayStatus();
    res.json({
      status: status === "Ready" ? "ok" : "degraded",
      service: "process-graph",
      replayStatus: status,
      replayError: status === "Failed" ? getReplayError() : undefined
    });
  });

  // /graph/approvals must be mounted before the general /graph router.
  // Auth + readiness gate are applied inline so they cannot be bypassed.
  const gate = [apiKeyAuth(config.apiKey), readinessGate()] as const;
  app.use("/graph/approvals", ...gate, approvalsRouter);
  app.use("/graph", ...gate, graphRouter);

  // Centralised error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
