import { proxySubsystemPost } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	return proxySubsystemPost('navigator-ai', '/caipl/session', request.headers, body);
};
