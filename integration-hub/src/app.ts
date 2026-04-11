import express from "express";
import helmet from "helmet";
import { createHubRouter } from "./api/hub.routes";
import { createMcpRouter } from "./api/mcp.routes";
import { createProcessRouter } from "./api/process.routes";
import { MeshClient } from "./clients/meshClient";
import { PgeClient } from "./clients/pgeClient";
import { AppConfig } from "./config/env";
import { GovernanceFacade } from "./domain/governanceFacade";
import { HypermediaBuilder } from "./domain/hypermediaBuilder";
import { McpCatalog } from "./domain/mcpCatalog";
import { ProcessFacade } from "./domain/processFacade";
import { SessionStore } from "./domain/sessionStore";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { toProblem } from "./utils/errors";

export function createApp(config: AppConfig) {
  const app = express();

  const catalog = new McpCatalog(config.meshAdapterId);
  const pgeClient = new PgeClient(config);
  const meshClient = new MeshClient(config);
  const governanceFacade = new GovernanceFacade(catalog);
  const hypermediaBuilder = new HypermediaBuilder(catalog, governanceFacade);
  const processFacade = new ProcessFacade(catalog, pgeClient, meshClient, hypermediaBuilder);
  const sessionStore = new SessionStore();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "integration-hub" });
  });

  app.use(apiKeyAuth(config.apiKey));
  app.use("/mcp", createMcpRouter(catalog));
  app.use("/process", createProcessRouter(catalog, processFacade));
  app.use("/api/v1/hub", createHubRouter({ processFacade, catalog, sessionStore, config }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
