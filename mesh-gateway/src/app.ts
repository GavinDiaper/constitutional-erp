import express from "express";
import helmet from "helmet";
import { createApprovalsRouter } from "./api/approvals.routes";
import { createMeshRouter } from "./api/mesh.routes";
import { AuthorityClient } from "./clients/authorityClient";
import { FoundationErpClient } from "./clients/foundationErpClient";
import { GovernanceClient } from "./clients/governanceClient";
import { loadConfig } from "./config/env";
import { checkDependencies } from "./domain/dependencyChecks";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { toProblem } from "./utils/errors";

const config = loadConfig();

const authorityClient = new AuthorityClient(config);
const governanceClient = new GovernanceClient(config);
const foundationClient = new FoundationErpClient(config);

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "mesh-gateway" });
  });

  app.get("/mesh/ready", async (_req, res, next) => {
    try {
      const status = await checkDependencies({
        authorityClient,
        governanceClient,
        foundationClient
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
      foundationClient
    })
  );

  app.use(
    "/mesh",
    createMeshRouter({
      actorHeader: config.actorIdHeader,
      authorityClient,
      governanceClient,
      foundationClient
    })
  );

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
