import { proxyHubGet, proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxyHubGet(`/projects/${params.projectId}/milestones`, request.headers);
};

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(
		`/projects/${params.projectId}/milestones`,
		request.headers,
		'POST',
		await request.json() as unknown
	);
};