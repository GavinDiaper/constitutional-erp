import { NextFunction, Request, Response } from "express";
import { getReplayError, getReplayStatus } from "../projection/runtimeState";

export function readinessGate() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const status = getReplayStatus();
    if (status !== "Ready") {
      res.status(503).json({
        code: "replay_not_ready",
        status,
        detail: status === "Failed" ? getReplayError() || "Replay failed" : "Event processor replay in progress"
      });
      return;
    }

    next();
  };
}