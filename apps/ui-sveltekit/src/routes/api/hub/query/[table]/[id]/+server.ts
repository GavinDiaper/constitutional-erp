import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	return proxyHubGet(`/query/${params.table}/${params.id}`, request.headers);
};
