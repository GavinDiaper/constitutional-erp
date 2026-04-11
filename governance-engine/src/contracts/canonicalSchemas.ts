import { z } from "zod";

const eventBaseSchema = z
  .object({
  entityId: z.string().min(1),
    type: z.string().min(1),
  version: z.number().int().min(1),
  occurredAt: z.string().min(1),
    sourceEventId: z.string().min(1),
    payload: z.record(z.unknown())
  })
  .strict();

export const canonicalEventSchema = eventBaseSchema;
