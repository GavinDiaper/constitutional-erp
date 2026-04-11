import { canonicalEventSchema } from "../contracts/canonicalSchemas";
import { RawEventEnvelope } from "../contracts/rawEvent";
import { newId } from "../utils/id";
import { SourceAdapter } from "./types";
import { asObject, defaultMetadata, toCanonicalEngineEventType, toKebabCase } from "./helpers";

export const governanceAdapter: SourceAdapter = {
  sourceSystem: "governance-engine",
  normalize(envelope: RawEventEnvelope) {
    const row = envelope.rawPayload;
    const payload = asObject(row.payload);
    const entityType = String(row.entity_type ?? row.entityType ?? "GovernanceEvent");
    const entityId = String(row.entity_id ?? row.entityId ?? newId("GOV-"));
    const rawEventType = String(row.event_type ?? row.eventType ?? "UnknownEvent");
    const domain = typeof payload.domain === "string" ? payload.domain : "GOVERNANCE";

    return canonicalEventSchema.parse({
      eventId: String(row.event_id ?? row.eventId ?? newId("LEVT-")),
      eventType: toCanonicalEngineEventType("Governance", rawEventType),
      eventVersion: Number(row.version ?? 1),
      occurredAt: String(row.timestamp ?? envelope.receivedAt),
      source: {
        system: "governance-engine",
        streamId: String(row.event_id ?? row.eventId ?? entityId),
        sequence: 0
      },
      correlation: {
        correlationId: typeof row.correlation_id === "string" ? row.correlation_id : typeof row.correlationId === "string" ? row.correlationId : undefined,
        causationId: typeof row.causation_id === "string" ? row.causation_id : typeof row.causationId === "string" ? row.causationId : undefined
      },
      actor: {
        actorId: typeof payload.actorId === "string" ? payload.actorId : undefined,
        ingressId: "governance-engine",
        impersonated: Boolean(payload.impersonated ?? false)
      },
      domain: {
        domain,
        aggregateType: toKebabCase(entityType),
        aggregateId: entityId,
        tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined
      },
      payload,
      metadata: defaultMetadata("governance-engine", domain, [rawEventType])
    });
  },
  cursorOf(row) {
    return String(row.timestamp ?? "");
  }
};