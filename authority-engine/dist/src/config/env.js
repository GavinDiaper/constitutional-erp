"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
require("dotenv/config");
function required(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function loadConfig() {
    return {
        port: Number(process.env.PORT ?? 4001),
        nodeEnv: process.env.NODE_ENV ?? "development",
        apiKey: required("API_KEY", "change-me"),
        databasePath: process.env.DATABASE_PATH ?? "authority.db",
        foundationErpUrl: required("FOUNDATION_ERP_URL", "http://localhost:3000"),
        foundationErpApiKey: required("FOUNDATION_ERP_API_KEY", "change-me"),
        foundationErpIngressId: required("FOUNDATION_ERP_INGRESS_ID", "foundation-ingress"),
        foundationErpIngressIdHeader: required("FOUNDATION_ERP_INGRESS_ID_HEADER", "x-ingress-id").toLowerCase(),
        pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000)
    };
}
