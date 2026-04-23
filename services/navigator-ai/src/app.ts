import express from "express";
import helmet from "helmet";
import { createCaiplRouter } from "./api/caipl.routes";
import { createNavigatorRouter } from "./api/navigator.routes";
import { queryRouter } from "./api/query.routes";
import { AuthorityClient } from "./clients/authorityClient";
import { CepClient } from "./clients/cepClient";
import { GovernanceClient } from "./clients/governanceClient";
import { IntegrationHubClient } from "./clients/integrationHubClient";
import { loadConfig } from "./config/env";
import { getStartupError, getStartupStatus } from "./domain/runtimeState";
import { createLlmClient } from "./llm/providerFactory";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { readinessGate } from "./middleware/readinessGate";
import { CaiplService } from "./services/caiplService";
import { NavigatorService } from "./services/navigatorService";
import { toProblem } from "./utils/errors";

const config = loadConfig();

const integrationHubClient = new IntegrationHubClient(config);
const authorityClient = new AuthorityClient(config);
const governanceClient = new GovernanceClient(config);
const cepClient = new CepClient(config);
const llmClient = createLlmClient(config);

export const navigatorDependencies = {
  llmClient
};

export function createApp() {
  const app = express();
  const service = new NavigatorService(integrationHubClient, authorityClient, governanceClient, cepClient, llmClient);
  const caiplService = new CaiplService();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const startupStatus = getStartupStatus();
    res.json({
      status: startupStatus === "Ready" ? "ok" : "degraded",
      service: "navigator-ai",
      llm: {
        provider: llmClient.provider,
        model: llmClient.model
      },
      startupStatus,
      startupError: startupStatus === "Failed" ? getStartupError() : undefined
    });
  });

  app.use("/api/v1", apiKeyAuth(config.apiKey));
  app.use("/api/v1", queryRouter);
  app.use("/api/v1", readinessGate(), createCaiplRouter(caiplService));
  app.use("/api/v1", readinessGate(), createNavigatorRouter(service));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
