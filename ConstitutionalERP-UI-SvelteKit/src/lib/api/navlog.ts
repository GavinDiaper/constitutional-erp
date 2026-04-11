import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export function getSessions(actor: ActorContext): Promise<{ data: unknown[] }> {
	return fetchHubJson<{ data: unknown[] }>('/api/hub/sessions', actor);
}

export function getSessionNavlog(
	sessionId: string,
	actor: ActorContext,
	options: { entryType?: string; limit?: number } = {}
): Promise<{ data: unknown[] }> {
	const params = new URLSearchParams();
	if (options.entryType) {
		params.set('entry_type', options.entryType);
	}
	params.set('limit', String(options.limit ?? 200));

	const suffix = params.toString() ? `?${params.toString()}` : '';
	return fetchHubJson<{ data: unknown[] }>(`/api/hub/sessions/${sessionId}/navlog${suffix}`, actor);
}
