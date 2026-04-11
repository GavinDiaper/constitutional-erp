import { z } from "zod";
import { CanonicalEvent } from "../contracts/canonicalEvents";
import { canonicalEventSchema } from "../contracts/canonicalSchemas";

export interface FoundationEventRow {
  event_id?: string;
  eventId?: string;
  entity_id?: string;
  entityId?: string;
  event_type?: string;
  eventType?: string;
  version?: number;
  timestamp?: string;
  payload?: unknown;
}

const recordSchema = z.record(z.unknown());

function asObject(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    return recordSchema.parse(JSON.parse(payload));
  }

  return recordSchema.parse(payload ?? {});
}

function eventTypeOf(row: FoundationEventRow): string {
  return String(row.event_type ?? row.eventType ?? "");
}

function eventIdOf(row: FoundationEventRow): string {
  return String(row.event_id ?? row.eventId ?? "");
}

function entityIdOf(row: FoundationEventRow): string {
  return String(row.entity_id ?? row.entityId ?? "");
}

function occurredAtOf(row: FoundationEventRow): string {
  return String(row.timestamp ?? "");
}

function versionOf(row: FoundationEventRow): number {
  return Number(row.version ?? 1);
}

function parseCanonicalEvent(event: CanonicalEvent): CanonicalEvent {
  return canonicalEventSchema.parse(event) as CanonicalEvent;
}

export function mapFoundationEventToCanonical(row: FoundationEventRow): CanonicalEvent | null {
  const entityId = entityIdOf(row);
  const type = eventTypeOf(row);
  if (!entityId || !type) {
    return null;
  }

  const sourceEventId = eventIdOf(row);
  const occurredAt = occurredAtOf(row);
  const version = versionOf(row);

  return parseCanonicalEvent({
    entityId,
    type,
    version,
    occurredAt,
    sourceEventId,
    payload: asObject(row.payload)
  });
}
