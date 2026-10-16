import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(
		`/o2c/contracts/${encodeURIComponent(params.contractId)}/versions/${encodeURIComponent(params.versionNumber)}/approve`,
		request.headers,
		'POST',
		{}
	);
};
