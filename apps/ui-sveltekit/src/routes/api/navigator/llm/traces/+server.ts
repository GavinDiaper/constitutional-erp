import { proxySubsystemGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const query = url.searchParams.toString();
	const path = query.length > 0 ? `/llm/traces?${query}` : '/llm/traces';
	return proxySubsystemGet('navigator-ai', path, request.headers);
};
