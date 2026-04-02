import { NextFunction, Request, Response } from "express";
import { getStartupError, getStartupStatus } from "../domain/runtimeState";

export function readinessGate() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const status = getStartupStatus();
    if (status !== "Ready") {
      res.status(503).json({
        code: "navigator_not_ready",
        status,
        detail: status === "Failed" ? getStartupError() || "Navigator startup failed" : "Navigator booting"
      });
      return;
    }

    next();
  };
}
