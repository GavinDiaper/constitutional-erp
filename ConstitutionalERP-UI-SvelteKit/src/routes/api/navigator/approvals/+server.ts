import { proxySubsystemGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const query = url.search ? url.search : '';
	return proxySubsystemGet('navigator-ai', `/approvals${query}`, request.headers);
};