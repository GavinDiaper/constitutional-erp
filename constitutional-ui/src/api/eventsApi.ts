import { http } from "./http";

export interface EntityEvent {
  event_id: string;
  entity_id: string;
  entity_type: string;
  event_type: string;
  version: number;
  timestamp: string;
  payload: string;
  correlation_id: string | null;
  causation_id: string | null;
  actor: string | null;
  governance_json: string | null;
}

export async function getEntityEvents(
  entityType: string,
  entityId: string
): Promise<EntityEvent[]> {
  const result = await http<{ data: EntityEvent[] }>(`/api/v1/events?limit=200`);
  return result.data.filter(
    (e) => e.entity_type === entityType && e.entity_id === entityId
  );
}
