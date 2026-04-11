"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = apiKeyAuth;
const errors_1 = require("../utils/errors");
function apiKeyAuth(requiredApiKey) {
    return (req, _res, next) => {
        const key = req.header("x-api-key");
        if (!key || key !== requiredApiKey) {
            next(new errors_1.HttpError(401, "unauthorized", "Missing or invalid API key"));
            return;
        }
        next();
    };
}
