import express from "express";
import helmet from "helmet";
import { FoundationAdapter } from "./adapters/foundationAdapter";
import { AdapterRegistry } from "./adapters/registry";
import { createApprovalsRouter } from "./api/approvals.routes";
import { eventRouter } from "./api/events.routes";
import { createMeshRouter } from "./api/mesh.routes";
import { queryRouter } from "./api/query.routes";
import { AuthorityClient } from "./clients/authorityClient";
import { GovernanceClient } from "./clients/governanceClient";
import { AppConfig, loadConfig } from "./config/env";
import { checkDependencies } from "./domain/dependencyChecks";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { jwtActorContext } from "./middleware/jwtActorContext";
import { toProblem } from "./utils/errors";

const defaultConfig = loadConfig();

interface AppOverrides {
  config?: AppConfig;
  authorityClient?: AuthorityClient;
  governanceClient?: GovernanceClient;
  adapterRegistry?: AdapterRegistry;
}

export function createApp(overrides: AppOverrides = {}) {
  const config = overrides.config ?? defaultConfig;
  const authorityClient = overrides.authorityClient ?? new AuthorityClient(config);
  const governanceClient = overrides.governanceClient ?? new GovernanceClient(config);
  const adapterRegistry = overrides.adapterRegistry ?? new AdapterRegistry([new FoundationAdapter(config)]);

  const app = express();

  app.use(helmet());
  app.use(express.json());
  app.use(jwtActorContext(config));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "mesh-gateway" });
  });

  app.get("/mesh/ready", async (_req, res, next) => {
    try {
      const status = await checkDependencies({
        authorityClient,
        governanceClient,
        adapters: adapterRegistry.list()
      });

      if (!status.ready) {
        res.status(503).json(status);
        return;
      }

      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  app.use("/mesh", apiKeyAuth(config.apiKey));
  app.use(
    "/mesh/approvals",
    createApprovalsRouter({
      actorHeader: config.actorIdHeader,
      authorityClient,
      governanceClient,
      adapterRegistry
    })
  );

  app.use(
    "/mesh",
    createMeshRouter({
      actorHeader: config.actorIdHeader,
      authorityClient,
      governanceClient,
      adapterRegistry
    })
  );

  app.use("/api/v1", apiKeyAuth(config.apiKey), eventRouter);
  app.use("/api/v1", apiKeyAuth(config.apiKey), queryRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
