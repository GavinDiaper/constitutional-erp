import { proxyHubGet, proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	return proxyHubGet('/inv/movements', request.headers);
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	return proxyMeshRequest(`foundation/ops/inv/movements`, '', request.headers, 'POST', payload);
};
