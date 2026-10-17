import { proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const body = (await request.json()) as unknown;
	return proxyMeshRequest(`foundation/ops/proj/projects/${params.projectId}/generate-requisition-lines`, '', request.headers, 'POST',
		body
	);
};
