import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, url }) => {
	const suffix = url.search ? `${url.search}` : '';
	return proxyHubGet(`/query/${params.table}${suffix}`, request.headers);
};
