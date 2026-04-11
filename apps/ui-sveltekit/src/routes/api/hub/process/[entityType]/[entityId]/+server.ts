import { proxyHubGet, proxyIhGet } from '$lib/server/hubProxy';
import { mapEntityTypeToRoute } from '$lib/server/processEntityRoute';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const mappedRoute = mapEntityTypeToRoute(params.entityType, params.entityId);
	if (mappedRoute.startsWith('/process/')) {
		return proxyIhGet(mappedRoute, request.headers);
	}
	return proxyHubGet(mappedRoute, request.headers);
};
