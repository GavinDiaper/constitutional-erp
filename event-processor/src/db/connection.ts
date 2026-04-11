import Database from "better-sqlite3";
import { loadConfig } from "../config/env";

const config = loadConfig();

export const db = new Database(config.databasePath, {
  verbose: config.nodeEnv === "development" ? console.log : undefined
});

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function transaction<T>(work: () => T): T {
  const wrapped = db.transaction(work);
  return wrapped();
}