import { http } from "./http";

export async function getEntityEvents(entityType: string, entityId: string) {
  return http<unknown>(`/api/v1/hub/events/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}
