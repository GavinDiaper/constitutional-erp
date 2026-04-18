import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	return proxyHubGet('/inv/skus', request.headers);
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	return proxyHubRequest('/inv/skus', request.headers, 'POST', payload);
};
