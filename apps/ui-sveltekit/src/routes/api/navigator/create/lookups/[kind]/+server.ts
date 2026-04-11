import { proxySubsystemGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, url }) => {
	const query = url.searchParams.toString();
	const path = query.length > 0
		? `/create/lookups/${encodeURIComponent(params.kind)}?${query}`
		: `/create/lookups/${encodeURIComponent(params.kind)}`;
	return proxySubsystemGet('navigator-ai', path, request.headers);
};
