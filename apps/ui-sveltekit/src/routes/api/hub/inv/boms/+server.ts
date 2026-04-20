import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const params = new URLSearchParams();
	const organizationId = url.searchParams.get('organizationId');
	const limit = url.searchParams.get('limit');
	const offset = url.searchParams.get('offset');

	if (organizationId) {
		params.set('organizationId', organizationId);
	}
	if (limit) {
		params.set('limit', limit);
	}
	if (offset) {
		params.set('offset', offset);
	}

	const suffix = params.toString() ? `?${params.toString()}` : '';
	return proxyHubGet(`/bom${suffix}`, request.headers);
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	return proxyHubRequest('/bom', request.headers, 'POST', payload);
};
