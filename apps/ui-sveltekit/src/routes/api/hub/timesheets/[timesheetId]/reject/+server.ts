import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(`/timesheets/${params.timesheetId}/reject`, request.headers, 'POST', await request.json() as unknown);
};