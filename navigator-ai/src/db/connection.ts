import Database from "better-sqlite3";
import { loadConfig } from "../config/env";

const config = loadConfig();

export const db = new Database(config.databasePath, {
  verbose: process.env.NAVIGATOR_SQL_DEBUG === "1" ? console.log : undefined
});

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function transaction<T>(work: () => T): T {
  const wrapped = db.transaction(work);
  return wrapped();
}
