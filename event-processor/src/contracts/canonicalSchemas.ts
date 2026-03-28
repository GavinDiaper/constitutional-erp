import { z } from "zod";

export const canonicalSourceSystemSchema = z.enum([
  "foundation-erp",
  "mesh-gateway",
  "authority-engine",
  "governance-engine",
  "navigator-ai",
  "external-erp"
]);

export const canonicalEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  eventVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  source: z.object({
    system: canonicalSourceSystemSchema,
    streamId: z.string().min(1),
    sequence: z.number().int().nonnegative()
  }),
  correlation: z.object({
    correlationId: z.string().min(1).optional(),
    causationId: z.string().min(1).optional()
  }),
  actor: z.object({
    actorId: z.string().min(1).optional(),
    ingressId: z.string().min(1).optional(),
    impersonated: z.boolean()
  }),
  domain: z.object({
    domain: z.string().min(1),
    aggregateType: z.string().min(1),
    aggregateId: z.string().min(1),
    tenantId: z.string().min(1).optional()
  }),
  payload: z.record(z.unknown()),
  metadata: z.object({
    schemaVersion: z.number().int().positive(),
    tags: z.array(z.string().min(1)),
    flags: z.object({
      isReplay: z.boolean(),
      isSynthetic: z.boolean()
    })
  })
});