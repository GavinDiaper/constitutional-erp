import fs from "node:fs";
import path from "node:path";
import { db } from "./connection";

function resolveMigrationDir(): string {
  const candidates = [
    path.join(__dirname, "migrations"),
    path.join(process.cwd(), "src", "db", "migrations")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Migration directory not found. Checked: ${candidates.join(", ")}`);
}

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
  const migrationDir = resolveMigrationDir();
  const fullPath = path.join(migrationDir, fileName);
  const sql = fs.readFileSync(fullPath, "utf8");
  const run = db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO migration(id, applied_at) VALUES (?, ?)").run(fileName, new Date().toISOString());
  });

  run();
  console.log(`Applied migration: ${fileName}`);
}

export function runMigrations() {
  ensureMigrationsTable();

  const migrationDir = resolveMigrationDir();
  const applied = getAppliedMigrations();
  const files = fs
    .readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (!applied.has(file)) {
      applyMigration(file);
    }
  }

  console.log("Migrations complete");
}
