import { z } from "zod";
import { db } from "../../db/connection";
import { HttpError } from "../../utils/errors";
import { engineGet } from "./engineClients";
import { ReadModelEntry, getReadModelEntry, readModel, tableColumns } from "./readModel";
import type { McpToolDefinition } from "./registry";

const MAX_LIMIT = 100;
const CHILD_ROW_LIMIT = 50;
const MAX_FIND_CANDIDATES = 200;

type Verb = "get" | "list" | "find" | "describe";

export function readToolNames(e: ReadModelEntry): Record<Verb, string | undefined> {
  return {
    get: e.primaryKey ? `${e.domain}_get_${e.entity}` : undefined,
    list: `${e.domain}_list_${e.plural}`,
    find: e.primaryKey ? `${e.domain}_find_${e.entity}` : undefined,
    describe: `${e.domain}_describe_${e.entity}`
  };
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const pascal = (value: string) => value.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");

function visibleColumns(e: ReadModelEntry) {
  return tableColumns(e.table).filter((c) => !e.excludeColumns.includes(c.name));
}

function summaryColumns(e: ReadModelEntry, visible: string[]): string[] {
  const wanted = [
    ...(e.primaryKey && e.primaryKey !== "rowid" ? [e.primaryKey] : []),
    ...e.labelColumns,
    ...(e.stateColumn ? [e.stateColumn] : []),
    ...["created_at", "updated_at"]
  ];
  const picked = [...new Set(wanted)].filter((c) => visible.includes(c));
  return picked.length > 0 ? picked : visible.slice(0, 5);
}

function selectFields(e: ReadModelEntry, requested: string[] | undefined, fallback: "summary" | "all"): string[] {
  const visible = visibleColumns(e).map((c) => c.name);
  if (requested && requested.length > 0) {
    const unknown = requested.filter((f) => !visible.includes(f));
    if (unknown.length > 0) {
      throw new HttpError(400, "invalid_input", `Unknown field(s) ${unknown.join(", ")} on ${e.table}. Valid fields: ${visible.join(", ")}`);
    }
    return requested;
  }
  return fallback === "all" ? visible : summaryColumns(e, visible);
}

function pkColumn(e: ReadModelEntry): string {
  if (!e.primaryKey) {
    throw new HttpError(400, "invalid_input", `${e.table} has no primary key`);
  }
  return e.primaryKey === "rowid" ? "rowid" : quote(e.primaryKey);
}

function bindable(value: string | number | boolean): string | number {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

function pkValue(e: ReadModelEntry, id: string): string | number {
  return e.primaryKey === "rowid" && /^\d+$/.test(id) ? Number(id) : id;
}

interface ChildLink {
  table: string;
  entity: string;
  foreignKey: string;
  parentKey: string;
}

function childLinks(parent: ReadModelEntry): ChildLink[] {
  const links: ChildLink[] = [];
  for (const child of readModel) {
    if (!child.mcp || child.table === parent.table) continue;
    const fks = db.prepare(`PRAGMA foreign_key_list(${quote(child.table)})`).all() as Array<{ table: string; from: string; to: string | null }>;
    for (const fk of fks) {
      if (fk.table === parent.table) {
        links.push({ table: child.table, entity: child.entity, foreignKey: fk.from, parentKey: fk.to ?? parent.primaryKey ?? "" });
      }
    }
  }
  return links;
}

function listHandler(e: ReadModelEntry) {
  return (input: Record<string, any>) => {
    const visible = visibleColumns(e).map((c) => c.name);
    const fields = selectFields(e, input.fields, "summary");
    const where: string[] = [];
    const params: Array<string | number> = [];

    for (const [column, value] of Object.entries((input.filters ?? {}) as Record<string, string | number | boolean>)) {
      if (!visible.includes(column)) {
        throw new HttpError(400, "invalid_input", `Cannot filter ${e.table} by '${column}'. Valid columns: ${visible.join(", ")}`);
      }
      where.push(`${quote(column)} = ?`);
      params.push(bindable(value));
    }
    if (input.state !== undefined) {
      if (!e.stateColumn) {
        throw new HttpError(400, "invalid_input", `${e.table} has no state column; use filters instead`);
      }
      where.push(`${quote(e.stateColumn)} = ?`);
      params.push(input.state);
    }

    let orderBy: string;
    if (input.orderBy !== undefined) {
      if (!visible.includes(input.orderBy)) {
        throw new HttpError(400, "invalid_input", `Cannot order ${e.table} by '${input.orderBy}'`);
      }
      orderBy = `${quote(input.orderBy)} ${input.orderDir === "desc" ? "DESC" : "ASC"}`;
    } else if (visible.includes("created_at")) {
      orderBy = `${quote("created_at")} DESC`;
    } else {
      orderBy = e.primaryKey ? `${pkColumn(e)} ASC` : `${quote(visible[0])} ASC`;
    }

    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;
    const sql = `SELECT ${fields.map(quote).join(", ")} FROM ${quote(e.table)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const rows = db.prepare(sql).all(...params, limit + 1, offset) as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { table: e.table, rows: page, paging: { limit, offset, count: page.length, hasMore, nextOffset: hasMore ? offset + limit : null } };
  };
}

function getHandler(e: ReadModelEntry) {
  return (input: Record<string, any>) => {
    const fields = selectFields(e, input.fields, "all");
    const raw = db.prepare(`SELECT * FROM ${quote(e.table)} WHERE ${pkColumn(e)} = ?`).get(pkValue(e, input.id)) as Record<string, unknown> | undefined;
    if (!raw) {
      throw new HttpError(404, "not_found", `No ${e.entity} found for ${e.primaryKey}=${input.id}. Use ${readToolNames(e).find} to search by name.`);
    }
    const record = Object.fromEntries(fields.map((f) => [f, raw[f]]));

    const include = (input.include ?? []) as string[];
    if (include.length === 0) {
      return { table: e.table, record };
    }

    const links = childLinks(e);
    const unknown = include.filter((name) => !links.some((l) => l.table === name));
    if (unknown.length > 0) {
      throw new HttpError(400, "invalid_input", `Unknown child table(s) ${unknown.join(", ")}. Valid: ${links.map((l) => l.table).join(", ") || "none"}`);
    }
    const children: Record<string, unknown[]> = {};
    for (const link of links.filter((l) => include.includes(l.table))) {
      const child = getReadModelEntry(link.table)!;
      const cols = visibleColumns(child).map((c) => c.name);
      children[link.table] = db
        .prepare(`SELECT ${cols.map(quote).join(", ")} FROM ${quote(link.table)} WHERE ${quote(link.foreignKey)} = ? LIMIT ${CHILD_ROW_LIMIT}`)
        .all(raw[link.parentKey]);
    }
    return { table: e.table, record, children };
  };
}

function scoreCandidate(text: string, pk: string, label: string): number {
  const t = text.trim().toLowerCase();
  const l = label.toLowerCase();
  const tokens = t.split(/\s+/).filter(Boolean);
  if (l === t || pk.toLowerCase() === t) return 1;
  if (l.startsWith(t)) return 0.85;
  const words = l.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.every((tok) => words.includes(tok))) return 0.7;
  if (l.includes(t)) return 0.55;
  return 0.4;
}

function findHandler(e: ReadModelEntry) {
  return (input: Record<string, any>) => {
    const visible = visibleColumns(e).map((c) => c.name);
    const searchColumns = e.searchColumns.filter((c) => visible.includes(c));
    const tokens = String(input.text).trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || searchColumns.length === 0) {
      throw new HttpError(400, "invalid_input", "Provide non-empty search text");
    }

    const where = tokens.map(() => `(${searchColumns.map((c) => `CAST(${quote(c)} AS TEXT) LIKE ? ESCAPE '\\'`).join(" OR ")})`).join(" AND ");
    const params = tokens.flatMap((tok) => {
      const pattern = `%${tok.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      return searchColumns.map(() => pattern);
    });
    const fields = [...new Set([...summaryColumns(e, visible), ...e.labelColumns.filter((c) => visible.includes(c))])];
    const rows = db
      .prepare(`SELECT ${fields.map(quote).join(", ")} FROM ${quote(e.table)} WHERE ${where} LIMIT ${MAX_FIND_CANDIDATES}`)
      .all(...params) as Array<Record<string, unknown>>;

    const pk = e.primaryKey && e.primaryKey !== "rowid" ? e.primaryKey : fields[0];
    const scored = rows
      .map((row) => {
        const label = e.labelColumns.map((c) => row[c]).filter((v) => v !== null && v !== undefined && v !== "").join(" ") || String(row[pk]);
        return {
          id: row[pk],
          label,
          state: e.stateColumn ? row[e.stateColumn] : undefined,
          score: scoreCandidate(input.text, String(row[pk]), label),
          summary: row
        };
      })
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, input.limit ?? 10);

    const top = scored[0]?.score ?? 0;
    const ambiguous = scored.filter((c) => c.score === top).length > 1;
    return {
      table: e.table,
      query: input.text,
      candidates: scored,
      ambiguous,
      // Only set when exactly one best candidate exists; otherwise ask the user to disambiguate.
      resolved: scored.length > 0 && !ambiguous ? scored[0].id : undefined
    };
  };
}

function describeHandler(e: ReadModelEntry) {
  return () => {
    const columns = visibleColumns(e);
    const references = (db.prepare(`PRAGMA foreign_key_list(${quote(e.table)})`).all() as Array<{ table: string; from: string; to: string | null }>).map((fk) => ({
      column: fk.from,
      table: fk.table,
      referencedColumn: fk.to
    }));
    const stateValues = e.stateColumn
      ? (db.prepare(`SELECT DISTINCT ${quote(e.stateColumn)} AS value FROM ${quote(e.table)} WHERE ${quote(e.stateColumn)} IS NOT NULL ORDER BY 1 LIMIT 25`).all() as Array<{ value: string }>).map((r) => r.value)
      : undefined;
    const rowCount = (db.prepare(`SELECT COUNT(*) AS n FROM ${quote(e.table)}`).get() as { n: number }).n;
    return {
      table: e.table,
      domain: e.domain,
      entity: e.entity,
      primaryKey: e.primaryKey,
      columns: columns.map((c) => ({ name: c.name, type: c.type, required: c.notNull })),
      labelColumns: e.labelColumns,
      searchColumns: e.searchColumns,
      stateColumn: e.stateColumn,
      stateValues,
      references,
      children: childLinks(e).map((l) => ({ table: l.table, foreignKey: l.foreignKey })),
      tools: readToolNames(e),
      rowCount
    };
  };
}

const scalar = z.union([z.string(), z.number(), z.boolean()]);

function generateForEntry(e: ReadModelEntry, taken: Set<string>): McpToolDefinition[] {
  const names = readToolNames(e);
  const label = e.entity.replace(/_/g, " ");
  const tag = (verb: string) => `${e.domain.toUpperCase()}.${pascal(e.entity)}.${verb}`;
  const defs: McpToolDefinition[] = [];

  const add = (verb: Verb, description: string, zodSchema: z.ZodTypeAny, handler: McpToolDefinition["handler"]) => {
    const name = names[verb];
    // Pre-existing catalog tools keep their name and semantics.
    if (!name || taken.has(name)) return;
    defs.push({
      name,
      domain: e.domain,
      entity: pascal(e.entity),
      action: verb,
      kind: "read",
      riskLevel: "Low",
      governanceTag: tag(pascal(verb)),
      description,
      zodSchema,
      handler
    });
  };

  const fieldsSchema = z.array(z.string()).optional().describe("Columns to return; defaults to a compact summary");

  add(
    "list",
    `List ${label} records (${e.table}). Filter by exact column values${e.stateColumn ? ` or state (${e.stateColumn})` : ""}; paged, max ${MAX_LIMIT} rows. Use ${names.describe} to see columns.`,
    z.object({
      filters: z.record(scalar).optional().describe("Exact-match filters keyed by column name"),
      ...(e.stateColumn ? { state: z.string().optional().describe(`Filter by ${e.stateColumn}`) } : {}),
      fields: fieldsSchema,
      orderBy: z.string().optional(),
      orderDir: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe("Default 25"),
      offset: z.number().int().min(0).optional()
    }),
    listHandler(e)
  );

  if (e.primaryKey) {
    add(
      "get",
      `Get one ${label} by ${e.primaryKey}. Use ${names.find} when you only know a name.`,
      z.object({
        id: z.string().min(1).describe(e.primaryKey),
        fields: fieldsSchema,
        include: z.array(z.string()).optional().describe(`Child tables to include (see ${names.describe})`)
      }),
      getHandler(e)
    );
    add(
      "find",
      `Find ${label} records by name or text (${e.searchColumns.join(", ")}). Returns ranked candidates with ids; if several share the best score, ask the user which one is meant. Never guess ids.`,
      z.object({
        text: z.string().min(1).describe("Name or text to search for"),
        limit: z.number().int().min(1).max(25).optional().describe("Default 10")
      }),
      findHandler(e)
    );
  }

  add(
    "describe",
    `Describe ${label} (${e.table}): columns, key, states, relationships, child tables and row count.`,
    z.object({}),
    describeHandler(e)
  );

  return defs;
}

function safeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function crossCuttingTools(): McpToolDefinition[] {
  const base = { riskLevel: "Low" as const, kind: "read" as const };
  return [
    {
      ...base,
      name: "erp_list_tables",
      domain: "sys",
      entity: "Table",
      action: "list",
      governanceTag: "SYS.Table.List",
      description: "List every readable table with its domain, entity and the read tools available for it",
      zodSchema: z.object({ domain: z.string().optional() }),
      handler: (input) => ({
        data: readModel
          .filter((e) => e.mcp && (!input.domain || e.domain === input.domain))
          .map((e) => ({ table: e.table, domain: e.domain, entity: e.entity, primaryKey: e.primaryKey, tools: readToolNames(e) }))
      })
    },
    {
      ...base,
      name: "erp_get_history",
      domain: "sys",
      entity: "History",
      action: "get",
      governanceTag: "SYS.History.Get",
      description: "Get the event history of any entity (newest first): who did what and when",
      zodSchema: z.object({
        entityId: z.string().min(1),
        entityType: z.string().optional().describe("Optional, e.g. Requisition"),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe("Default 25")
      }),
      handler: (input) => {
        const rows = db
          .prepare(
            `SELECT event_id, entity_id, entity_type, event_type, version, timestamp, actor, payload
             FROM event WHERE entity_id = ? ${input.entityType ? "AND entity_type = ?" : ""}
             ORDER BY timestamp DESC, version DESC LIMIT ?`
          )
          .all(...[input.entityId, ...(input.entityType ? [input.entityType] : []), input.limit ?? 25]) as Array<Record<string, any>>;
        return { events: rows.map((r) => ({ ...r, payload: safeJson(r.payload), actor: safeJson(r.actor) })) };
      }
    },
    {
      ...base,
      name: "authority_get_profile",
      domain: "h2r",
      entity: "AuthorityProfile",
      action: "get",
      governanceTag: "H2R.AuthorityProfile.Get",
      description: "Get an employee's authority: active positions, authority domain and tier, as held by the authority engine",
      zodSchema: z.object({ employeeId: z.string().min(1) }),
      handler: async (input) => {
        const subject = await engineGet<{ data: Record<string, unknown> }>("authority", `/api/v1/query/authority_subject/${encodeURIComponent(input.employeeId)}`);
        const positions = await engineGet<{ data: Array<Record<string, any>> }>("authority", "/api/v1/query/authority_position?limit=500");
        const mine = positions.data.filter((p) => p.employee_id === input.employeeId);
        const highestTierByDomain: Record<string, number> = {};
        for (const p of mine.filter((p) => p.active === 1)) {
          highestTierByDomain[p.authority_domain] = Math.max(highestTierByDomain[p.authority_domain] ?? 0, Number(p.authority_tier));
        }
        return { employee: subject.data, positions: mine, highestTierByDomain };
      }
    },
    {
      ...base,
      name: "authority_list_eligible_approvers",
      domain: "h2r",
      entity: "AuthorityApprover",
      action: "list",
      governanceTag: "H2R.AuthorityApprover.List",
      description: "List employees who hold at least the given authority tier in a domain and can therefore approve",
      zodSchema: z.object({ domain: z.enum(["O2C", "P2P", "R2R", "H2R", "PROJ", "INV"]), tier: z.number().int().min(1).max(5) }),
      handler: async (input) => engineGet("authority", `/authority/eligible-approvers?domain=${encodeURIComponent(input.domain)}&tier=${input.tier}`)
    },
    {
      ...base,
      name: "gov_get_parameters",
      domain: "sys",
      entity: "GovernanceParameter",
      action: "get",
      governanceTag: "SYS.GovernanceParameter.Get",
      description: "Get governance parameters (thresholds that drive approval requirements)",
      zodSchema: z.object({}),
      handler: async () => engineGet("governance", "/governance/parameters")
    }
  ];
}

export function generateReadTools(existingNames: Iterable<string>): McpToolDefinition[] {
  const taken = new Set(existingNames);
  const defs: McpToolDefinition[] = [];
  for (const e of readModel.filter((entry) => entry.mcp)) {
    defs.push(...generateForEntry(e, taken));
  }
  for (const def of crossCuttingTools()) {
    if (!taken.has(def.name)) defs.push(def);
  }
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.name)) {
      throw new Error(`MCP read tool name collision: ${def.name}`);
    }
    seen.add(def.name);
  }
  return defs;
}
