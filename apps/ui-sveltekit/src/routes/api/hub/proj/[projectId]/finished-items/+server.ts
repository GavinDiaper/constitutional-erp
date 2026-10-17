import { proxyHubGet, proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxyHubGet(`/projects/${params.projectId}/finished-items`, request.headers);
};

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json() as unknown;
	return proxyMeshRequest(`foundation/ops/proj/projects/${params.projectId}/finished-items`, '', request.headers, 'POST', body);
};
