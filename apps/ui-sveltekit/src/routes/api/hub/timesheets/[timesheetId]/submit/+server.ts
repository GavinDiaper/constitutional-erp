import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(`/timesheets/${params.timesheetId}/submit`, request.headers, 'POST', {});
};