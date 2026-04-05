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

export interface QueryRowResponse<T> {
	data: T;
	table: string;
	primaryKey: string;
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

export function queryRow<T>(table: string, id: string, actor: ActorContext): Promise<QueryRowResponse<T>> {
	return fetchHubJson<QueryRowResponse<T>>(`/api/hub/query/${table}/${encodeURIComponent(id)}`, actor);
}
