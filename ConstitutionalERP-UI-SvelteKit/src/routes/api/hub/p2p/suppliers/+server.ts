import { proxyIhGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const activeOnly = url.searchParams.get('activeOnly');
	const suffix = activeOnly ? `?activeOnly=${encodeURIComponent(activeOnly)}` : '';
	return proxyIhGet(`/api/v1/hub/lookups/p2p/suppliers${suffix}`, request.headers);
};
