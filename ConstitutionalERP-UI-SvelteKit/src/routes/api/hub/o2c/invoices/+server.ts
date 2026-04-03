import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	return proxyHubGet('/o2c/invoices', request.headers);
};