import { proxySubsystemGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
	const query = url.searchParams.toString();
	const path = query.length > 0 ? `/actions?${query}` : '/actions';
	return proxySubsystemGet('navigator-ai', path, request.headers);
};
