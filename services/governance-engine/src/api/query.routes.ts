import { Router } from "express";
import { db } from "../db/connection";
import { HttpError } from "../utils/errors";

const tablePrimaryKeys = {
  migration: "id",
  governance_rule: "rule_id",
  governance_projection_metadata: "key",
  governance_actor_credential: "credential_id",
  governance_action_history: "history_id",
  governance_decision_log: "decision_id",
  governance_event: "event_id"
} as const;

type QueryTable = keyof typeof tablePrimaryKeys;
const queryTables = Object.keys(tablePrimaryKeys) as QueryTable[];

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "invalid_request", `Expected a non-negative integer but received '${value}'`);
  }
  return parsed;
}

function toQueryTable(input: string): QueryTable {
  if (!queryTables.includes(input as QueryTable)) {
    throw new HttpError(404, "not_found", `Unknown table '${input}'`);
  }
  return input as QueryTable;
}

export const queryRouter = Router();

queryRouter.get("/query/tables", (_req, res) => {
  res.json({
    data: queryTables.map((name) => ({ name, primaryKey: tablePrimaryKeys[name] }))
  });
});

queryRouter.get("/query/:table", (req, res) => {
  const table = toQueryTable(req.params.table);
  const limit = Math.min(parsePositiveInt(req.query.limit, 100), 500);
  const offset = parsePositiveInt(req.query.offset, 0);
  const rows = db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).all(limit, offset);

  res.json({
    data: rows,
    table,
    paging: {
      limit,
      offset,
      count: rows.length
    }
  });
});

queryRouter.get("/query/:table/:id", (req, res) => {
  const table = toQueryTable(req.params.table);
  const primaryKey = tablePrimaryKeys[table];
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${primaryKey} = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", `No row found in '${table}' for '${primaryKey}=${req.params.id}'`);
  }

  res.json({
    data: row,
    table,
    primaryKey
  });
});
