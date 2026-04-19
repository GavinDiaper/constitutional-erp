import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json() as unknown;
	return proxyHubRequest(`/projects/${params.projectId}/complete`, request.headers, 'POST', body);
};
