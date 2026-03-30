import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	return proxyHubGet(`/process/${params.entityType}/${params.entityId}`, request.headers);
};
