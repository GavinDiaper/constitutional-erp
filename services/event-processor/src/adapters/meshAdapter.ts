import { canonicalEventSchema } from "../contracts/canonicalSchemas";
import { RawEventEnvelope } from "../contracts/rawEvent";
import { SourceAdapter } from "./types";
import { asObject, defaultMetadata, resourceParts, toCanonicalMeshEventType } from "./helpers";

export const meshAdapter: SourceAdapter = {
  sourceSystem: "mesh-gateway",
  normalize(envelope: RawEventEnvelope) {
    const row = envelope.rawPayload;
    const payload = asObject(row.payload_json ?? row.payload);
    const domain = typeof row.domain === "string" && row.domain ? row.domain : typeof payload.domain === "string" ? String(payload.domain) : "SYSTEM";
    const resource = typeof row.resource === "string" ? row.resource : undefined;
    const parts = resourceParts(resource);

    return canonicalEventSchema.parse({
      eventId: `MESH-${String(row.id ?? `${row.created_at}-${row.event_type}`)}`,
      eventType: toCanonicalMeshEventType(String(row.event_type ?? "UnknownEvent")),
      eventVersion: 1,
      occurredAt: String(row.created_at ?? envelope.receivedAt),
      source: {
        system: "mesh-gateway",
        streamId: "mesh-decision-log",
        sequence: Number(row.id ?? 0)
      },
      correlation: {
        correlationId: typeof payload.correlationId === "string" ? payload.correlationId : undefined,
        causationId: typeof payload.causationId === "string" ? payload.causationId : undefined
      },
      actor: {
        actorId: typeof row.actor_id === "string" ? row.actor_id : undefined,
        ingressId: "mesh-gateway",
        impersonated: Boolean(payload.impersonated ?? false)
      },
      domain: {
        domain,
        aggregateType: parts.aggregateType,
        aggregateId: parts.aggregateId,
        tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined
      },
      payload: {
        ...payload,
        action: row.action,
        decision: row.decision,
        reason: row.reason,
        resource
      },
      metadata: defaultMetadata("mesh-gateway", domain, [String(row.event_type ?? "")])
    });
  },
  cursorOf(row) {
    return `${String(row.created_at ?? "")}|${String(row.id ?? "0")}`;
  }
};