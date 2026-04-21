import { Router } from "express";
import { db } from "../db/connection";
import { HttpError } from "../utils/errors";

const tablePrimaryKeys = {
  migration: "id",
  navigator_llm_log: "id",
  navigator_ranking_decision: "id",
  navigator_simulation_run: "id",
  navigator_governance_outcome: "id",
  navigator_execution_trace: "id",
  navigator_repl_transcript: "id",
  navigator_cache: "cache_key",
  navigator_replay_metadata: "key",
  navigator_event_log: "id"
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

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asMessages(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
}

function mapLlmTraceRow(row: {
  id: string;
  kind: string;
  model: string;
  prompt_json: string;
  response_text: string;
  context_hash: string | null;
  created_at: string;
}, includeRaw: boolean) {
  const parsedPrompt = parseJson(row.prompt_json);
  const parsedResponse = parseJson(row.response_text);
  const parsedPromptObject = asRecord(parsedPrompt);
  const payload = parsedPromptObject ?? { messages: asMessages(parsedPrompt) };

  return {
    id: row.id,
    kind: row.kind,
    model: row.model,
    contextHash: row.context_hash,
    createdAt: row.created_at,
    request: {
      messageCount: asMessages(payload["messages"]).length,
      messages: asMessages(payload["messages"]),
      maxCompletionTokens: typeof payload["max_completion_tokens"] === "number"
        ? payload["max_completion_tokens"]
        : undefined,
      model: typeof payload["model"] === "string" ? payload["model"] : undefined
    },
    response: {
      text: row.response_text,
      parsedJson: parsedResponse
    },
    raw: includeRaw
      ? {
          promptJson: row.prompt_json,
          responseText: row.response_text
        }
      : undefined
  };
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

queryRouter.get("/llm/traces", (req, res) => {
  const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
  const offset = parsePositiveInt(req.query.offset, 0);
  const includeRaw = parseBoolean(req.query.includeRaw, false);
  const rows = db
    .prepare(
      `SELECT id, kind, model, prompt_json, response_text, context_hash, created_at
       FROM navigator_llm_log
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Array<{
    id: string;
    kind: string;
    model: string;
    prompt_json: string;
    response_text: string;
    context_hash: string | null;
    created_at: string;
  }>;

  res.json({
    data: rows.map((row) => mapLlmTraceRow(row, includeRaw)),
    paging: {
      limit,
      offset,
      count: rows.length
    }
  });
});

queryRouter.get("/llm/traces/:id", (req, res) => {
  const includeRaw = parseBoolean(req.query.includeRaw, false);
  const row = db
    .prepare(
      `SELECT id, kind, model, prompt_json, response_text, context_hash, created_at
       FROM navigator_llm_log
       WHERE id = ?`
    )
    .get(req.params.id) as
    | {
        id: string;
        kind: string;
        model: string;
        prompt_json: string;
        response_text: string;
        context_hash: string | null;
        created_at: string;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", `No row found in 'navigator_llm_log' for 'id=${req.params.id}'`);
  }

  res.json({
    data: mapLlmTraceRow(row, includeRaw)
  });
});
