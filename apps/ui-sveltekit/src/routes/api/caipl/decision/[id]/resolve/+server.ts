import { proxySubsystemPost } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json();
	return proxySubsystemPost(
		'navigator-ai',
		`/caipl/decision/${encodeURIComponent(params.id)}/resolve`,
		request.headers,
		body
	);
};
