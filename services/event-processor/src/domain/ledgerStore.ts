import { CanonicalEvent, LedgerQuery } from "../contracts/canonicalEvents";
import { db } from "../db/connection";

interface LedgerRow {
  id: string;
  event_type: string;
  event_version: number;
  occurred_at: string;
  recorded_at: string;
  source_system: CanonicalEvent["source"]["system"];
  source_stream_id: string;
  source_sequence: number;
  correlation_id: string | null;
  causation_id: string | null;
  actor_id: string | null;
  ingress_id: string | null;
  impersonated: number;
  domain: string;
  aggregate_type: string;
  aggregate_id: string;
  tenant_id: string | null;
  payload_json: string;
  metadata_json: string;
}

function mapLedgerRow(row: LedgerRow): CanonicalEvent {
  return {
    eventId: row.id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    occurredAt: row.occurred_at,
    source: {
      system: row.source_system,
      streamId: row.source_stream_id,
      sequence: row.source_sequence
    },
    correlation: {
      correlationId: row.correlation_id ?? undefined,
      causationId: row.causation_id ?? undefined
    },
    actor: {
      actorId: row.actor_id ?? undefined,
      ingressId: row.ingress_id ?? undefined,
      impersonated: row.impersonated === 1
    },
    domain: {
      domain: row.domain,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      tenantId: row.tenant_id ?? undefined
    },
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    metadata: JSON.parse(row.metadata_json) as CanonicalEvent["metadata"]
  };
}

export function appendCanonicalEvent(event: CanonicalEvent): boolean {
  const result = db.prepare(
    `INSERT OR IGNORE INTO ledger_events(
      id, event_type, event_version, occurred_at, recorded_at, source_system, source_stream_id, source_sequence,
      correlation_id, causation_id, actor_id, ingress_id, impersonated, domain, aggregate_type, aggregate_id,
      tenant_id, payload_json, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.eventId,
    event.eventType,
    event.eventVersion,
    event.occurredAt,
    new Date().toISOString(),
    event.source.system,
    event.source.streamId,
    event.source.sequence,
    event.correlation.correlationId ?? null,
    event.correlation.causationId ?? null,
    event.actor.actorId ?? null,
    event.actor.ingressId ?? null,
    event.actor.impersonated ? 1 : 0,
    event.domain.domain,
    event.domain.aggregateType,
    event.domain.aggregateId,
    event.domain.tenantId ?? null,
    JSON.stringify(event.payload),
    JSON.stringify(event.metadata)
  );

  return result.changes > 0;
}

export function listLedgerEvents(query: LedgerQuery = {}): CanonicalEvent[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.after) {
    clauses.push("occurred_at > ?");
    params.push(query.after);
  }

  if (query.sourceSystem) {
    clauses.push("source_system = ?");
    params.push(query.sourceSystem);
  }

  if (query.domain) {
    clauses.push("domain = ?");
    params.push(query.domain);
  }

  if (query.aggregateType) {
    clauses.push("aggregate_type = ?");
    params.push(query.aggregateType);
  }

  if (query.aggregateId) {
    clauses.push("aggregate_id = ?");
    params.push(query.aggregateId);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(query.limit ?? 100);

  const rows = db
    .prepare(
      `SELECT * FROM ledger_events ${whereClause} ORDER BY occurred_at ASC, recorded_at ASC, id ASC LIMIT ?`
    )
    .all(...params) as LedgerRow[];

  return rows.map(mapLedgerRow);
}

export function getAggregateStream(domain: string, aggregateType: string, aggregateId: string): CanonicalEvent[] {
  return listLedgerEvents({ domain, aggregateType, aggregateId, limit: 1000 });
}

export function countLedgerEvents(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM ledger_events").get() as { count: number };
  return row.count;
}

export function recordDeadLetter(input: {
  sourceSystem: string;
  sourceCursor?: string;
  errorCode: string;
  errorDetail: string;
  rawPayload: Record<string, unknown>;
}) {
  db.prepare(
    `INSERT INTO ledger_dead_letter(source_system, source_cursor, error_code, error_detail, raw_payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    input.sourceSystem,
    input.sourceCursor ?? null,
    input.errorCode,
    input.errorDetail,
    JSON.stringify(input.rawPayload),
    new Date().toISOString()
  );
}