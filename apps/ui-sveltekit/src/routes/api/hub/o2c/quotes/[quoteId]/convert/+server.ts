import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(
		`/o2c/quotes/${params.quoteId}/convert`,
		request.headers,
		'POST',
		await request.json() as unknown
	);
};