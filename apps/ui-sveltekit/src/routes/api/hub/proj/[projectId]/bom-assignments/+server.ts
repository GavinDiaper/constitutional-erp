import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxyHubGet(`/projects/${params.projectId}/bom-assignments`, request.headers);
};

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json() as unknown;
	return proxyHubRequest(`/projects/${params.projectId}/bom-assignments`, request.headers, 'POST', body);
};
