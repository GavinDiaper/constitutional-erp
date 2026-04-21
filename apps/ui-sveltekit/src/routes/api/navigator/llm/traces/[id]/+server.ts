import { proxySubsystemGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params, url }) => {
	const id = encodeURIComponent(params.id);
	const query = url.searchParams.toString();
	const path = query.length > 0 ? `/llm/traces/${id}?${query}` : `/llm/traces/${id}`;
	return proxySubsystemGet('navigator-ai', path, request.headers);
};
