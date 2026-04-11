import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const suffix = url.search ? `${url.search}` : '';
	return proxyHubGet(`/events${suffix}`, request.headers);
};
