import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export function getSessionTranscript(sessionId: string, actor: ActorContext): Promise<{ data: unknown[] }> {
	return fetchHubJson<{ data: unknown[] }>(`/api/hub/sessions/${sessionId}/transcript`, actor);
}
