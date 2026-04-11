"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const authority_routes_1 = require("./api/authority.routes");
const events_routes_1 = require("./api/events.routes");
const env_1 = require("./config/env");
const apiKeyAuth_1 = require("./middleware/apiKeyAuth");
const readinessGate_1 = require("./middleware/readinessGate");
const state_1 = require("./projection/state");
const errors_1 = require("./utils/errors");
const config = (0, env_1.loadConfig)();
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use(express_1.default.json());
    app.get("/health", (_req, res) => {
        const replayStatus = (0, state_1.getReplayStatus)();
        res.json({
            status: replayStatus === "Ready" ? "ok" : "degraded",
            service: "authority-engine",
            replayStatus,
            replayError: replayStatus === "Failed" ? (0, state_1.getReplayError)() : undefined
        });
    });
    app.use("/authority", (0, apiKeyAuth_1.apiKeyAuth)(config.apiKey), (0, readinessGate_1.readinessGate)(), authority_routes_1.authorityRouter);
    app.use("/api/v1", (0, apiKeyAuth_1.apiKeyAuth)(config.apiKey), events_routes_1.eventRouter);
    app.use((err, _req, res, _next) => {
        const problem = (0, errors_1.toProblem)(err);
        res.status(problem.status).json(problem.body);
    });
    return app;
}
