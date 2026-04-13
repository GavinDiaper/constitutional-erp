import express from "express";
import helmet from "helmet";
import { authRouter } from "./api/auth.routes";
import { identityRouter } from "./api/identity.routes";
import { runMigrations } from "./db/migrate";
import { toProblem } from "./utils/errors";

export function createApp() {
  runMigrations();

  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      service: "user-identity",
      status: "ok",
      health: "/health"
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "user-identity" });
  });

  app.use(authRouter);
  app.use(identityRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const problem = toProblem(err);
    res.status(problem.status).json(problem.body);
  });

  return app;
}
