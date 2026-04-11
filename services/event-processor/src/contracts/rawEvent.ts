import { CanonicalSourceSystem } from "./canonicalEvents";

export interface RawEventEnvelope {
  sourceSystem: CanonicalSourceSystem;
  rawPayload: Record<string, unknown>;
  receivedAt: string;
}