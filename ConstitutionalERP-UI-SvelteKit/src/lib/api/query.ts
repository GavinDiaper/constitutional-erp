import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface QueryTableResponse<T> {
	data: T[];
	table: string;
	paging?: {
		limit: number;
		offset: number;
		count: number;
	};
}

export function queryTable<T>(
	table: string,
	actor: ActorContext,
	limit = 500,
	offset = 0
): Promise<QueryTableResponse<T>> {
	const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
	return fetchHubJson<QueryTableResponse<T>>(`/api/hub/query/${table}?${params.toString()}`, actor);
}
