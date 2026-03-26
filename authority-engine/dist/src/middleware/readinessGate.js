"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readinessGate = readinessGate;
const state_1 = require("../projection/state");
function readinessGate() {
    return (_req, res, next) => {
        const status = (0, state_1.getReplayStatus)();
        if (status !== "Ready") {
            res.status(503).json({
                code: "replay_not_ready",
                status,
                detail: status === "Failed" ? (0, state_1.getReplayError)() || "Replay failed" : "Authority projection replay in progress"
            });
            return;
        }
        next();
    };
}
