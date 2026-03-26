export interface CanonicalEvent {
  type: string;
  entityId: string;
  version: number;
  occurredAt: string;
  sourceEventId: string;
  payload: Record<string, unknown>;
}
