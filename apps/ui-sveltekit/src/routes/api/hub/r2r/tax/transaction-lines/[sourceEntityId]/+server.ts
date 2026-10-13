import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxyHubGet(`/r2r/tax/transaction-lines/${encodeURIComponent(params.sourceEntityId)}`, request.headers);
};