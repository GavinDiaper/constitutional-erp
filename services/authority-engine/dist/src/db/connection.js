"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.transaction = transaction;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const env_1 = require("../config/env");
const config = (0, env_1.loadConfig)();
exports.db = new better_sqlite3_1.default(config.databasePath, {
    verbose: config.nodeEnv === "development" ? console.log : undefined
});
exports.db.pragma("journal_mode = WAL");
exports.db.pragma("foreign_keys = ON");
function transaction(work) {
    const wrapped = exports.db.transaction(work);
    return wrapped();
}
