"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const connection_1 = require("./connection");
const MIGRATION_DIR = node_path_1.default.join(__dirname, "migrations");
function ensureMigrationsTable() {
    connection_1.db.exec(`
    CREATE TABLE IF NOT EXISTS migration (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}
function getAppliedMigrations() {
    const rows = connection_1.db.prepare("SELECT id FROM migration").all();
    return new Set(rows.map((row) => row.id));
}
function applyMigration(fileName) {
    const fullPath = node_path_1.default.join(MIGRATION_DIR, fileName);
    const sql = node_fs_1.default.readFileSync(fullPath, "utf8");
    const run = connection_1.db.transaction(() => {
        connection_1.db.exec(sql);
        connection_1.db.prepare("INSERT INTO migration(id, applied_at) VALUES (?, ?)").run(fileName, new Date().toISOString());
    });
    run();
    console.log(`Applied migration: ${fileName}`);
}
function runMigrations() {
    ensureMigrationsTable();
    const applied = getAppliedMigrations();
    const files = node_fs_1.default
        .readdirSync(MIGRATION_DIR)
        .filter((name) => name.endsWith(".sql"))
        .sort();
    for (const file of files) {
        if (!applied.has(file)) {
            applyMigration(file);
        }
    }
    console.log("Migrations complete");
}
if (require.main === module) {
    runMigrations();
}
