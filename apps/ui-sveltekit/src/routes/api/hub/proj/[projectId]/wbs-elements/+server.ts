import { proxyHubGet, proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxyHubGet(`/projects/${params.projectId}/wbs-elements`, request.headers);
};

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyMeshRequest(`foundation/ops/proj/projects/${params.projectId}/wbs-elements`, '', request.headers, 'POST',
		await request.json() as unknown
	);
};