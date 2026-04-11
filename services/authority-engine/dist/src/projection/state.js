"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReplayStatus = getReplayStatus;
exports.setReplayStatus = setReplayStatus;
exports.getReplayError = getReplayError;
exports.getLastEventTimestamp = getLastEventTimestamp;
exports.setLastEventTimestamp = setLastEventTimestamp;
const connection_1 = require("../db/connection");
function upsertMetadata(key, value) {
    connection_1.db.prepare(`INSERT INTO authority_metadata(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}
function getMetadata(key) {
    const row = connection_1.db.prepare("SELECT value FROM authority_metadata WHERE key = ?").get(key);
    return row?.value;
}
function getReplayStatus() {
    const status = getMetadata("replay_status") ?? "Booting";
    if (status === "Booting" || status === "Replaying" || status === "Ready" || status === "Failed") {
        return status;
    }
    return "Failed";
}
function setReplayStatus(status, error) {
    upsertMetadata("replay_status", status);
    if (status === "Failed") {
        upsertMetadata("replay_error", error ?? "Replay failed");
    }
    else if (error === undefined) {
        upsertMetadata("replay_error", "");
    }
}
function getReplayError() {
    return getMetadata("replay_error") ?? "";
}
function getLastEventTimestamp() {
    return getMetadata("last_event_timestamp") ?? "";
}
function setLastEventTimestamp(timestamp) {
    upsertMetadata("last_event_timestamp", timestamp);
}
