import { CanonicalSourceSystem, SourceCursorStatus } from "../contracts/canonicalEvents";
import { db } from "../db/connection";

interface CursorRow {
  source_system: CanonicalSourceSystem;
  cursor: string | null;
  last_event_at: string | null;
  last_status: string;
  last_error: string | null;
  last_polled_at: string | null;
  updated_at: string;
}

function mapCursorRow(row: CursorRow): SourceCursorStatus {
  return {
    sourceSystem: row.source_system,
    cursor: row.cursor ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
    lastStatus: row.last_status,
    lastError: row.last_error ?? undefined,
    lastPolledAt: row.last_polled_at ?? undefined,
    updatedAt: row.updated_at
  };
}

export function getSourceCursor(sourceSystem: CanonicalSourceSystem): SourceCursorStatus | undefined {
  const row = db.prepare("SELECT * FROM cep_source_cursor WHERE source_system = ?").get(sourceSystem) as CursorRow | undefined;
  return row ? mapCursorRow(row) : undefined;
}

export function upsertSourceCursor(input: {
  sourceSystem: CanonicalSourceSystem;
  cursor?: string;
  lastEventAt?: string;
  lastStatus: string;
  lastError?: string;
}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cep_source_cursor(source_system, cursor, last_event_at, last_status, last_error, last_polled_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_system) DO UPDATE SET
       cursor = excluded.cursor,
       last_event_at = excluded.last_event_at,
       last_status = excluded.last_status,
       last_error = excluded.last_error,
       last_polled_at = excluded.last_polled_at,
       updated_at = excluded.updated_at`
  ).run(
    input.sourceSystem,
    input.cursor ?? null,
    input.lastEventAt ?? null,
    input.lastStatus,
    input.lastError ?? null,
    now,
    now
  );
}

export function listSourceCursors(): SourceCursorStatus[] {
  const rows = db
    .prepare("SELECT * FROM cep_source_cursor ORDER BY source_system ASC")
    .all() as CursorRow[];
  return rows.map(mapCursorRow);
}