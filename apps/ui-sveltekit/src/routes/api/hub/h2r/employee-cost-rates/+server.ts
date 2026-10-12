import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	return proxyHubGet(`/h2r/employee-cost-rates${url.search}`, request.headers);
};

export const POST: RequestHandler = async ({ request }) => {
	return proxyHubRequest('/h2r/employee-cost-rates', request.headers, 'POST', await request.json() as unknown);
};