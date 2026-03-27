export type ReplayStatus = "Booting" | "Replaying" | "Ready" | "Failed";

let replayStatus: ReplayStatus = "Booting";
let replayError = "";

export function setReplayStatus(status: ReplayStatus, error = "") {
  replayStatus = status;
  replayError = error;
}

export function getReplayStatus(): ReplayStatus {
  return replayStatus;
}

export function getReplayError(): string {
  return replayError;
}