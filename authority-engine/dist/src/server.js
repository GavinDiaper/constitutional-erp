"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const migrate_1 = require("./db/migrate");
const consumer_1 = require("./projection/consumer");
const replay_1 = require("./projection/replay");
const state_1 = require("./projection/state");
async function main() {
    const config = (0, env_1.loadConfig)();
    (0, migrate_1.runMigrations)();
    (0, state_1.setReplayStatus)("Replaying");
    const app = (0, app_1.createApp)();
    const server = app.listen(config.port, () => {
        console.log(`authority-engine listening on ${config.port}`);
    });
    try {
        await (0, replay_1.replayToHead)();
        (0, state_1.setReplayStatus)("Ready");
        (0, consumer_1.startPollingConsumer)(config.pollIntervalMs);
        console.log("authority-engine replay complete; service is ready");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown replay error";
        (0, state_1.setReplayStatus)("Failed", message);
        console.error("authority-engine startup replay failed", error);
        server.close(() => {
            process.exit(1);
        });
    }
}
main().catch((error) => {
    console.error("authority-engine fatal startup error", error);
    process.exit(1);
});
