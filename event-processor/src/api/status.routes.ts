import { Router } from "express";
import { countLedgerEvents } from "../domain/ledgerStore";
import { listSourceCursors } from "../domain/sourceCursorStore";
import { getReplayError, getReplayStatus } from "../projection/runtimeState";

export const statusRouter = Router();

statusRouter.get("/ingestion", (_req, res) => {
  const replayStatus = getReplayStatus();
  res.json({
    status: replayStatus,
    replayError: replayStatus === "Failed" ? getReplayError() : undefined,
    ledgerEventCount: countLedgerEvents(),
    sources: listSourceCursors()
  });
});