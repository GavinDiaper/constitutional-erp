import { proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyMeshRequest(`foundation/ops/proj/projects/${params.projectId}/milestones/${params.milestoneId}/approve`, '', request.headers, 'POST',
		{}
	);
};