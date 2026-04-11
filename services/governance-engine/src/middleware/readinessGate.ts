import { NextFunction, Request, Response } from "express";
import { getReplayError, getReplayStatus } from "../projection/state";

export function readinessGate() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const status = getReplayStatus();
    if (status !== "Ready") {
      res.status(503).json({
        code: "replay_not_ready",
        status,
        detail: status === "Failed" ? getReplayError() || "Replay failed" : "Governance projection replay in progress"
      });
      return;
    }

    next();
  };
}
