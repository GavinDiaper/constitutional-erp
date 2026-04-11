"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPollingConsumer = startPollingConsumer;
const replay_1 = require("./replay");
function startPollingConsumer(pollIntervalMs) {
    return setInterval(async () => {
        try {
            await (0, replay_1.replayToHead)();
        }
        catch (error) {
            console.error("authority-engine polling consumer error", error);
        }
    }, pollIntervalMs);
}
