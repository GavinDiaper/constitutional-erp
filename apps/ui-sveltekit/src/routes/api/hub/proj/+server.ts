import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const suffix = url.search ? `?${url.searchParams.toString()}` : '';
	return proxyHubGet(`/projects${suffix}`, request.headers);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json() as unknown;
	return proxyHubRequest('/projects', request.headers, 'POST', body);
};
