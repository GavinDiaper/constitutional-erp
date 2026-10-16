import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const suffix = url.search ? `?${url.searchParams.toString()}` : '';
	return proxyHubGet(`/projects${suffix}`, request.headers);
};
