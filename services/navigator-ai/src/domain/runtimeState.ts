export type StartupStatus = "Booting" | "Ready" | "Failed";

let startupStatus: StartupStatus = "Booting";
let startupError = "";

export function setStartupStatus(status: StartupStatus, error = "") {
  startupStatus = status;
  startupError = error;
}

export function getStartupStatus(): StartupStatus {
  return startupStatus;
}

export function getStartupError(): string {
  return startupError;
}
