import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export function getSessions(actor: ActorContext): Promise<{ data: unknown[] }> {
	return fetchHubJson<{ data: unknown[] }>('/api/hub/sessions', actor);
}

export function getSessionNavlog(sessionId: string, actor: ActorContext): Promise<{ data: unknown[] }> {
	return fetchHubJson<{ data: unknown[] }>(`/api/hub/sessions/${sessionId}/navlog`, actor);
}
