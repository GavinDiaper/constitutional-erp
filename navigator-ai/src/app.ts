import express from "express";
import helmet from "helmet";
import { createNavigatorRouter } from "./api/navigator.routes";
import { AuthorityClient } from "./clients/authorityClient";
import { CepClient } from "./clients/cepClient";
import { GovernanceClient } from "./clients/governanceClient";
import { MeshClient } from "./clients/meshClient";
import { PgeClient } from "./clients/pgeClient";
import { loadConfig } from "./config/env";
import { getStartupError, getStartupStatus } from "./domain/runtimeState";
import { AzureOpenAiClient } from "./llm/azureOpenAiClient";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { readinessGate } from "./middleware/readinessGate";
import { NavigatorService } from "./services/navigatorService";
import { toProblem } from "./utils/errors";

const config = loadConfig();

const pgeClient = new PgeClient(config);
const authorityClient = new AuthorityClient(config);
const governanceClient = new GovernanceClient(config);
const meshClient = new MeshClient(config);
const cepClient = new CepClient(config);
const llmClient = new AzureOpenAiClient(config);

export const navigatorDependencies = {
  llmClient
};

export function createApp() {
  const app = express();
  const service = new NavigatorService(pgeClient, authorityClient, governanceClient, meshClient, cepClient, llmClient);

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const startupStatus = getStartupStatus();
    res.json({
      status: startupStatus === "Ready" ? "ok" : "degraded",
      service: "navigator-ai",
      startupStatus,
      startupError: startupStatus === "Failed" ? getStartupError() : undefined
    });
  });

  app.use("/api/v1", apiKeyAuth(config.apiKey));
  app.use("/api/v1", readinessGate(), createNavigatorRouter(service));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
