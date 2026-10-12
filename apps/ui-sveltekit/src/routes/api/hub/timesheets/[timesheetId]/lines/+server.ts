import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxyHubGet(`/timesheets/${params.timesheetId}/lines`, request.headers);
};