import express from "express";
import helmet from "helmet";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { internalTrafficGuard } from "./middleware/internalTraffic";
import { actorContext } from "./middleware/actorContext";
import { loadConfig } from "./config/env";
import { o2cRouter } from "./api/hypermedia/o2c.routes";
import { p2pRouter } from "./api/hypermedia/p2p.routes";
import { r2rRouter } from "./api/hypermedia/r2r.routes";
import { h2rRouter } from "./api/hypermedia/h2r.routes";
import { mcpRouter } from "./api/mcp/mcp.routes";
import { eventRouter } from "./api/events.routes";
import { queryRouter } from "./api/query.routes";
import { navlogRouter } from "./api/navlog/navlog.routes";
import { authRouter } from "./api/auth.routes";
import { toProblem } from "./utils/errors";
import { seedStarterAccounts } from "./domain/r2r/account/accountService";
import { seedTaxConfiguration } from "./domain/tax/taxSeedService";
import { seedDefaultLegalEntity } from "./domain/r2r/legalEntity/legalEntityService";
import { runMigrations } from "./db/migrate";

const config = loadConfig();

export function createApp() {
  runMigrations();
  seedStarterAccounts();
  seedTaxConfiguration();
  seedDefaultLegalEntity();

  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "foundation-erp" });
  });

  app.use(authRouter);

  app.use(
    "/api/v1",
    internalTrafficGuard({
      allowlist: config.internalAllowlist,
      ingressIdHeader: config.ingressIdHeader,
      ingressIdValue: config.ingressIdValue
    }),
    apiKeyAuth(config.apiKey),
    actorContext
  );

  app.use("/api/v1/o2c", o2cRouter);
  app.use("/api/v1/p2p", p2pRouter);
  app.use("/api/v1/r2r", r2rRouter);
  app.use("/api/v1/h2r", h2rRouter);
  app.use("/api/v1/mcp", mcpRouter);
  app.use("/api/v1/hub", navlogRouter);
  app.use("/api/v1", eventRouter);
  app.use("/api/v1", queryRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
