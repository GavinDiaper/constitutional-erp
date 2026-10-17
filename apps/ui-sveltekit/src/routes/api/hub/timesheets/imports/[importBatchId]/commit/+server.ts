import { proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyMeshRequest(`foundation/ops/timesheets/imports/${params.importBatchId}/commit`, '', request.headers, 'POST', {});
};