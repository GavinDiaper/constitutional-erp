import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	return proxyHubGet(`/r2r/trial-balance/${params.fiscalPeriodId}`, request.headers);
};
