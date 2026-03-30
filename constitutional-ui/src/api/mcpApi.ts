import { http } from "./http";

export async function getMcpCatalog(entityType: string, entityId: string) {
  return http<unknown>(`/api/v1/hub/mcp/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}
