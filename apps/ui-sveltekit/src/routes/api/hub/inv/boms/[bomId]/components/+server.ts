import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	return proxyHubGet(`/bom/${params.bomId}/components`, request.headers);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	return proxyHubRequest(`/bom/${params.bomId}/components`, request.headers, 'POST', payload);
};
