import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(
		`/projects/${params.projectId}/milestones/${params.milestoneId}/approve`,
		request.headers,
		'POST',
		{}
	);
};