import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export function getMcpFunctions(actor: ActorContext): Promise<{ data: unknown[] }> {
	return fetchHubJson<{ data: unknown[] }>('/api/hub/mcp/functions', actor);
}
