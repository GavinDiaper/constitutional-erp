import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	return proxyHubRequest(`/bom/${params.bomId}/activate`, request.headers, 'POST');
};
