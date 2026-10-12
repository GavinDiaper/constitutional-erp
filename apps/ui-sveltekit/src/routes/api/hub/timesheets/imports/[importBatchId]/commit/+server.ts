import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(`/timesheets/imports/${params.importBatchId}/commit`, request.headers, 'POST', {});
};