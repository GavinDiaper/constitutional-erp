import { CanonicalEvent, CanonicalSourceSystem } from "../contracts/canonicalEvents";
import { RawEventEnvelope } from "../contracts/rawEvent";

export interface SourceAdapter {
  readonly sourceSystem: CanonicalSourceSystem;
  normalize(envelope: RawEventEnvelope): CanonicalEvent;
  cursorOf(row: Record<string, unknown>): string;
}