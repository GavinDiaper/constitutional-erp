import { http } from "./http";

export type ProcessState = {
  entityType: string;
  entityId: string;
  state: string;
};

export async function getProcessState(entityType: string, entityId: string) {
  return http<ProcessState>(`/api/v1/hub/process/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}
