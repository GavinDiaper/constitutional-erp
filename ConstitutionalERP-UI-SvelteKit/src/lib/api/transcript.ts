import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export function getSessionTranscript(
	sessionId: string,
	actor: ActorContext,
	options: { commandType?: string; status?: string; limit?: number } = {}
): Promise<{ data: unknown[] }> {
	const params = new URLSearchParams();
	if (options.commandType) {
		params.set('command_type', options.commandType);
	}
	if (options.status) {
		params.set('status', options.status);
	}
	params.set('limit', String(options.limit ?? 200));

	const suffix = params.toString() ? `?${params.toString()}` : '';
	return fetchHubJson<{ data: unknown[] }>(`/api/hub/sessions/${sessionId}/transcript${suffix}`, actor);
}
