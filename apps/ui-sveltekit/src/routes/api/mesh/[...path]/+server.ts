import { proxyMeshRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params, url }) => {
	return proxyMeshRequest(params.path, url.search, request.headers, 'GET');
};

export const POST: RequestHandler = async ({ request, params, url }) => {
	const body = (await request.json().catch(() => ({}))) as unknown;
	return proxyMeshRequest(params.path, url.search, request.headers, 'POST', body);
};
