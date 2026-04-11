import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface EventRow {
	event_id: string;
	entity_id?: string;
	entity_type?: string;
	event_type: string;
	version?: number;
	timestamp: string;
	payload?: unknown;
	correlation_id?: string;
	causation_id?: string;
	actor?: unknown;
	governance_json?: unknown;
}

export interface EventListResponse {
	data: EventRow[];
}

export function getEvents(
	actor: ActorContext,
	options: { limit?: number; after?: string } = {}
): Promise<EventListResponse> {
	const params = new URLSearchParams();
	params.set('limit', String(options.limit ?? 100));
	if (options.after) {
		params.set('after', options.after);
	}

	return fetchHubJson<EventListResponse>(`/api/hub/events?${params.toString()}`, actor);
}
