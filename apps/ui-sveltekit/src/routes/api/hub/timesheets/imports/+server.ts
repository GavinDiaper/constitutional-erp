import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	return proxyHubGet(`/timesheets/imports${url.search}`, request.headers);
};

export const POST: RequestHandler = async ({ request }) => {
	return proxyHubRequest('/timesheets/imports/preview', request.headers, 'POST', await request.json() as unknown);
};