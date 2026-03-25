import fs from "node:fs";
import path from "node:path";
import { db } from "./connection";

const MIGRATION_DIR = path.join(__dirname, "migrations");

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function getAppliedMigrations(): Set<string> {
  const rows = db.prepare("SELECT id FROM migration").all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

function applyMigration(fileName: string) {
  const fullPath = path.join(MIGRATION_DIR, fileName);
  const sql = fs.readFileSync(fullPath, "utf8");
  const run = db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO migration(id, applied_at) VALUES (?, ?)").run(fileName, new Date().toISOString());
  });

  run();
  console.log(`Applied migration: ${fileName}`);
}

function main() {
  ensureMigrationsTable();

  const applied = getAppliedMigrations();
  const files = fs
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

main();
