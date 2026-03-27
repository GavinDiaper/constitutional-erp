import { canonicalEventSchema } from "../contracts/canonicalSchemas";
import { RawEventEnvelope } from "../contracts/rawEvent";
import { newId } from "../utils/id";
import { SourceAdapter } from "./types";
import { asObject, defaultMetadata, domainFromEntityType, toKebabCase } from "./helpers";

export const foundationAdapter: SourceAdapter = {
  sourceSystem: "foundation-erp",
  normalize(envelope: RawEventEnvelope) {
    const row = envelope.rawPayload;
    const payload = asObject(row.payload);
    const entityType = String(row.entity_type ?? row.entityType ?? "Unknown");
    const entityId = String(row.entity_id ?? row.entityId ?? newId("FND-"));
    const eventType = String(row.event_type ?? row.eventType ?? "UnknownEvent");
    const domain = domainFromEntityType(entityType, typeof payload.domain === "string" ? String(payload.domain) : undefined);

    return canonicalEventSchema.parse({
      eventId: String(row.event_id ?? row.eventId ?? newId("LEVT-")),
      eventType: `${domain}.${eventType}`,
      eventVersion: Number(row.version ?? 1),
      occurredAt: String(row.timestamp ?? envelope.receivedAt),
      source: {
        system: "foundation-erp",
        streamId: String(row.event_id ?? row.eventId ?? entityId),
        sequence: 0
      },
      correlation: {
        correlationId: typeof row.correlation_id === "string" ? row.correlation_id : typeof row.correlationId === "string" ? row.correlationId : undefined,
        causationId: typeof row.causation_id === "string" ? row.causation_id : typeof row.causationId === "string" ? row.causationId : undefined
      },
      actor: {
        actorId: typeof payload.actorId === "string" ? payload.actorId : undefined,
        ingressId: typeof payload.ingressId === "string" ? payload.ingressId : "foundation-ingress",
        impersonated: Boolean(payload.impersonated ?? false)
      },
      domain: {
        domain,
        aggregateType: toKebabCase(entityType),
        aggregateId: entityId,
        tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined
      },
      payload,
      metadata: defaultMetadata("foundation-erp", domain, [eventType])
    });
  },
  cursorOf(row) {
    return String(row.timestamp ?? "");
  }
};