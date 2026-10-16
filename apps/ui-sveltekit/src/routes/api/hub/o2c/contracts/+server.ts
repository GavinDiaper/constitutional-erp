import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	return proxyHubGet(`/o2c/contracts${url.search}`, request.headers);
};
