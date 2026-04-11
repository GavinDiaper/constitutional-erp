import { NextFunction, Request, Response } from "express";
import { getReplayError, getReplayStatus } from "../projection/runtimeState";

export function readinessGate() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const status = getReplayStatus();
    if (status !== "Ready") {
      res.status(503).json({
        code: "service_not_ready",
        status,
        detail: status === "Failed" ? getReplayError() || "Service startup failed" : "Service starting up"
      });
      return;
    }

    next();
  };
}
