import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	return proxyHubGet(`/hub/sessions/${params.sessionId}/transcript`, request.headers);
};
