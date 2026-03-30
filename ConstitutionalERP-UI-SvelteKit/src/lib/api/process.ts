import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';
import type { ProcessResponse } from '$lib/types/hub';

export function getProcess(entityType: string, entityId: string, actor: ActorContext): Promise<ProcessResponse> {
	return fetchHubJson<ProcessResponse>(`/api/hub/process/${entityType}/${entityId}`, actor);
}
