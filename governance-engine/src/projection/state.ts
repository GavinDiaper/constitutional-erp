import { db } from "../db/connection";

export type ReplayStatus = "Booting" | "Replaying" | "Ready" | "Failed";

function upsertMetadata(key: string, value: string) {
  db.prepare(
    `INSERT INTO governance_projection_metadata(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function getMetadata(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM governance_projection_metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function getReplayStatus(): ReplayStatus {
  const status = getMetadata("replay_status") ?? "Booting";
  if (status === "Booting" || status === "Replaying" || status === "Ready" || status === "Failed") {
    return status;
  }

  return "Failed";
}

export function setReplayStatus(status: ReplayStatus, error?: string) {
  upsertMetadata("replay_status", status);
  if (status === "Failed") {
    upsertMetadata("replay_error", error ?? "Replay failed");
  } else if (error === undefined) {
    upsertMetadata("replay_error", "");
  }
}

export function getReplayError(): string {
  return getMetadata("replay_error") ?? "";
}

export function getLastEventTimestamp(): string {
  return getMetadata("last_event_timestamp") ?? "";
}

export function setLastEventTimestamp(timestamp: string) {
  upsertMetadata("last_event_timestamp", timestamp);
}
