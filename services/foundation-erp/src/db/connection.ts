import Database from "better-sqlite3";
import { loadConfig } from "../config/env";

let dbInstance: Database.Database | undefined;
let lastDatabaseKey: string | undefined;

function getDatabaseKey(): string {
  const config = loadConfig();
  return `${config.databasePath}|${config.nodeEnv}`;
}

function getDb(): Database.Database {
  const config = loadConfig();
  const key = `${config.databasePath}|${config.nodeEnv}`;

  if (!dbInstance || key !== lastDatabaseKey) {
    if (dbInstance) {
      dbInstance.close();
    }

    dbInstance = new Database(config.databasePath, {
      verbose: config.nodeEnv === "development" ? console.log : undefined
    });
    dbInstance.pragma("journal_mode = WAL");
    dbInstance.pragma("foreign_keys = ON");
    lastDatabaseKey = key;
  }

  return dbInstance;
}

export const db = new Proxy({} as Database.Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  }
});

export function transaction<T>(work: () => T): T {
  return getDb().transaction(work)();
}
